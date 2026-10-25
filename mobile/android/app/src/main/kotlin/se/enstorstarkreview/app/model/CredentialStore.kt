package se.enstorstarkreview.app.model

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlin.io.encoding.Base64

/** String storage for secrets. */
interface SecureStorage {
    fun get(key: String): String?
    fun set(key: String, value: String)
    fun remove(key: String)
}

data class Credentials(val username: String, val token: String)

/** The saved sign-in. */
class CredentialStore(private val storage: SecureStorage) {
    fun load(): Credentials? = runCatching {
        val token = storage.get(TOKEN) ?: return null
        val username = storage.get(USERNAME) ?: return null
        Credentials(username, token)
    }.onFailure { Log.e(TAG, "Could not read the saved session", it) }.getOrNull()

    fun save(credentials: Credentials) {
        runCatching {
            storage.set(TOKEN, credentials.token)
            storage.set(USERNAME, credentials.username)
        }.onFailure { Log.e(TAG, "Could not save the session", it) }
    }

    fun clear() {
        runCatching {
            storage.remove(TOKEN)
            storage.remove(USERNAME)
        }.onFailure { Log.e(TAG, "Could not remove the saved session", it) }
    }

    private companion object {
        const val TOKEN = "session.token"
        const val USERNAME = "session.username"
        const val TAG = "CredentialStore"
    }
}

/**
 * Values encrypted with an AES-GCM key in the Android Keystore, in private shared preferences.
 * The key never leaves the Keystore, and the app's backup rules exclude the preferences.
 */
class KeystoreStorage(context: Context) : SecureStorage {
    private val preferences = context.getSharedPreferences("secure", Context.MODE_PRIVATE)

    private val key: SecretKey by lazy {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(ALIAS, null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build(),
            )
            generateKey()
        }
    }

    override fun get(key: String): String? {
        val stored = preferences.getString(key, null) ?: return null
        val bytes = Base64.decode(stored)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, this.key, GCMParameterSpec(128, bytes, 0, IV_BYTES))
        return String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
    }

    override fun set(key: String, value: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, this.key)
        val encrypted = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        preferences.edit().putString(key, Base64.encode(encrypted)).apply()
    }

    override fun remove(key: String) {
        preferences.edit().remove(key).apply()
    }

    private companion object {
        const val ALIAS = "session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
    }
}

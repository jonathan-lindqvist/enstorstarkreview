package se.enstorstarkreview.app.model

import android.content.Context

/**
 * The Skip build (version 3, internal testing only) kept the session in SkipKeychain's
 * Tink-encrypted preferences. The native app does not read them, so testers sign in once after
 * the update; the old file is removed so that its token does not stay on the phone.
 */
object LegacySession {
    /** SkipKeychain's file name. */
    const val PREFERENCES = "tools.skip.SkipKeychain"

    fun remove(context: Context) {
        context.deleteSharedPreferences(PREFERENCES)
    }
}

package se.enstorstarkreview.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import se.enstorstarkreview.app.R

/** The hidden reviewer login. Only reachable through the version row in "Om". */
@Composable
fun LoginScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var username by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val canSubmit = !app.session.isSigningIn && username.isNotBlank() && password.isNotEmpty()
    LaunchedEffect(Unit) { app.session.clearError() }

    fun submit() {
        if (!canSubmit) return
        scope.launch {
            if (app.session.signIn(username, password)) {
                password = ""
                nav.popBackStack()
            }
        }
    }

    Scaffold(topBar = { SmallTopBar("Logga in", back = { nav.popBackStack() }) }, containerColor = Ess.bg) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(horizontal = 20.dp).padding(top = 8.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Image(painterResource(R.drawable.logo), null, Modifier.size(60.dp))
                Text("Recensentläge", Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineLarge)
                Text("För recensenter. Efter inloggningen kan du se utkast och publicera recensioner.", style = MaterialTheme.typography.bodyLarge, color = Ess.secondaryText)
            }
            EssTextField(
                username, { username = it }, "Användarnamn", Modifier.semantics { contentType = ContentType.Username }, icon = Ic.person, container = Ess.raised,
                keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Next),
            )
            EssTextField(
                password, { password = it }, "Lösenord", Modifier.semantics { contentType = ContentType.Password }, icon = Ic.key, isSecure = true,
                error = app.session.errorMessage, container = Ess.raised,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { submit() }),
            )
            Button(onClick = ::submit, Modifier.fillMaxWidth().height(52.dp), enabled = canSubmit) {
                if (app.session.isSigningIn) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Text("Logga in", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@file:OptIn(ExperimentalMaterial3Api::class)

package se.enstorstarkreview.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import se.enstorstarkreview.app.BuildConfig
import se.enstorstarkreview.app.R
import se.enstorstarkreview.app.model.Formatting
import se.enstorstarkreview.app.model.ReviewRequestModel

/**
 * Om: what the site is, how the stamps work, the tip form, the location note, and the version
 * row. A long press on the version row opens the hidden login.
 */
@Composable
fun AboutScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior(rememberTopAppBarState())
    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            LargeTopAppBar(
                title = { Text("Om", style = MaterialTheme.typography.displaySmall) }, scrollBehavior = scrollBehavior,
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Ess.bg, scrolledContainerColor = Ess.bg),
            )
        },
        containerColor = Ess.bg,
        contentWindowInsets = androidx.compose.foundation.layout.WindowInsets.Companion.statusBars,
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(horizontal = 14.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            app.session.username?.let { ReviewerCard(it) }
            Intro()
            StampScale()
            ReviewRequestCard(app.reviewRequest)
            LocationNote()
            VersionRow { nav.navigate(LoginRoute) }
            if (BuildConfig.DEBUG) {
                Row(Modifier.fillMaxWidth().background(Ess.raised, RoundedCornerShape(20.dp)).padding(horizontal = 18.dp).height(54.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Server", style = MaterialTheme.typography.bodyLarge)
                    Spacer(Modifier.weight(1f))
                    Text(app.api.serverOrigin, style = MaterialTheme.typography.bodyMedium, color = Ess.secondaryText, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun Card(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().background(Ess.raised, RoundedCornerShape(26.dp)).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
}

@Composable
private fun ReviewerCard(username: String) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    Row(Modifier.fillMaxWidth().background(Ess.raised, RoundedCornerShape(24.dp)).padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Avatar(username, 40.dp)
        Column(Modifier.weight(1f)) {
            Text("Recensentläge", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
            Text("Inloggad som ${Formatting.authorName(username)}", style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText)
        }
        OutlinedButton(onClick = { scope.launch { app.session.signOut() } }) { Text("Logga ut", color = Ess.bad) }
    }
}

@Composable
private fun Intro() = Card {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Image(painterResource(R.drawable.logo), null, Modifier.size(54.dp))
        Text("Vad är En Stor Stark?", Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineSmall)
    }
    Text(
        "En oberoende guide till barer. Vi besöker ställen, testar upplevelsen och skriver recensioner så att du slipper chansa när du planerar en utekväll.",
        style = MaterialTheme.typography.bodyLarge, color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.82f),
    )
}

@Composable
private fun StampScale() = Card {
    Text("Hur fungerar stämplarna?", Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
    Text("Barer som sticker ut får en stämpel för helhetsupplevelsen, högst tre. De flesta barer får ingen.", style = MaterialTheme.typography.bodyMedium, color = Ess.secondaryText)
    (0..3).forEach { rating ->
        Row(Modifier.semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.width(64.dp)) {
                if (rating == 0) Text("–", style = Ess.num(15), color = Ess.tertiaryText) else StampRow(rating, 26.dp, overlap = 0.2f)
            }
            Column {
                Text(Formatting.ratingWord(rating), style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Bold))
                Text(Formatting.ratingExplanation(rating), style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText)
            }
        }
    }
}

@Composable
private fun ReviewRequestCard(request: ReviewRequestModel) {
    val scope = rememberCoroutineScope()
    val words = KeyboardOptions(capitalization = KeyboardCapitalization.Words)
    Card {
        Text("Vilken bar borde vi recensera?", Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
        Text("Tipsa oss om ett ställe och berätta gärna varför det borde stå näst på tur. Vi samlar inte in några kontaktuppgifter.", style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText)
        request.successMessage?.let { Notice(it, Ic.check, Ess.good) }
        request.errorMessage?.let { Notice(it, Ic.error, Ess.bad) }
        EssTextField(request.barName, { request.barName = it }, "Barens namn", error = request.fieldErrors["/barName"], keyboardOptions = words)
        EssTextField(request.location, { request.location = it }, "Ort eller adress", error = request.fieldErrors["/location"], keyboardOptions = words)
        EssTextField(request.motivation, { request.motivation = it }, "Varför borde vi recensera den? (valfritt)", error = request.fieldErrors["/motivation"], minLines = 3,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
        Button(onClick = { scope.launch { request.submit() } }, Modifier.fillMaxWidth().height(50.dp), enabled = request.canSubmit) {
            if (request.isSubmitting) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                Icon(Ic.send, null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Skicka tips", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun Notice(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, color: androidx.compose.ui.graphics.Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, null, Modifier.size(18.dp), tint = color)
        Text(text, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = color)
    }
}

@Composable
private fun LocationNote() {
    Row(Modifier.fillMaxWidth().background(Ess.raised, RoundedCornerShape(24.dp)).padding(16.dp).semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(36.dp).background(Ess.amber.copy(alpha = 0.14f), CircleShape), contentAlignment = Alignment.Center) {
            Icon(Ic.locationOff, null, Modifier.size(18.dp), tint = Ess.amber)
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Kartan och din position", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Bold))
            Text(
                "Kartan visar bara adresser från publicerade recensioner. Om du tillåter platstjänster används din position bara i appen, på kartan och för att sortera efter avstånd. Vi skickar inte positionen till vår server och sparar den inte.",
                style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText,
            )
        }
    }
}

/** The version row. A long press opens the hidden reviewer login; a ring fills while the finger stays down. */
@Composable
private fun VersionRow(openLogin: () -> Unit) {
    val app = LocalApp.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val progress = remember { Animatable(0f) }
    var isPressing by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (isPressing) 0.97f else 1f, label = "press")
    val signedIn = app.session.isSignedIn
    val version = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"

    Row(
        Modifier.fillMaxWidth().scale(scale)
            .background(if (isPressing) Ess.raised3 else Ess.raised, RoundedCornerShape(20.dp))
            .pointerInput(signedIn) {
                if (signedIn) return@pointerInput
                awaitEachGesture {
                    awaitFirstDown()
                    isPressing = true
                    val hold = scope.launch {
                        progress.snapTo(0f)
                        progress.animateTo(1f, tween(800, easing = LinearEasing))
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        isPressing = false
                        openLogin()
                    }
                    waitForUpOrCancellation()
                    hold.cancel()
                    isPressing = false
                }
            }
            .clearAndSetSemantics {
                contentDescription = "Version $version"
                if (!signedIn) onLongClick("Logga in") { openLogin(); true }
            }
            .padding(horizontal = 18.dp).height(54.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Version", style = MaterialTheme.typography.bodyLarge)
        Spacer(Modifier.weight(1f))
        Text(version, style = MaterialTheme.typography.bodyLarge, color = Ess.secondaryText)
        if (isPressing) {
            Canvas(Modifier.padding(start = 8.dp).size(20.dp)) {
                val width = 3.dp.toPx()
                drawArc(Ess.amber, -90f, 360f * progress.value, false, Offset(width / 2, width / 2), Size(size.width - width, size.height - width), style = Stroke(width, cap = StrokeCap.Round))
            }
        }
    }
}

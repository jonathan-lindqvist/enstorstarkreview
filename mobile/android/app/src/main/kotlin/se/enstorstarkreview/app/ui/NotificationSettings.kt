package se.enstorstarkreview.app.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import se.enstorstarkreview.app.model.PushRegistrationModel

/**
 * Turns notifications on, then asks for the permission on Android 13+ when the system can still
 * show the dialog. When it cannot, the settings row links to the system settings instead.
 */
@Composable
fun rememberTurnOnNotifications(): () -> Unit {
    val push = LocalApp.current.push
    val activity = LocalActivity.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { push.update() }
    return {
        push.turnOn()
        if (activity != null && Build.VERSION.SDK_INT >= 33) {
            val permission = Manifest.permission.POST_NOTIFICATIONS
            val granted = ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED
            val ask = PushRegistrationModel.shouldRequestPermission(
                Build.VERSION.SDK_INT, granted, push.hasRequestedPermission, activity.shouldShowRequestPermissionRationale(permission),
            )
            if (ask) {
                push.didRequestPermission()
                launcher.launch(permission)
            }
        }
    }
}

/** The one-time question after the user has used the app a little. */
@Composable
fun NotificationPrompt() {
    val push = LocalApp.current.push
    val turnOn = rememberTurnOnNotifications()
    AlertDialog(
        onDismissRequest = { push.answerPrompt(accepted = false) },
        icon = { Icon(Ic.notifications, null, tint = Ess.amber) },
        title = { Text("Vill du få en notis när en ny recension publiceras?") },
        text = { Text("Du kan ändra det när som helst under Om.") },
        confirmButton = { TextButton(onClick = turnOn) { Text("Ja tack") } },
        dismissButton = { TextButton(onClick = { push.answerPrompt(accepted = false) }) { Text("Inte nu") } },
    )
}

/** The settings row on Om, wired to the model and the system settings. */
@Composable
fun NotificationSetting() {
    val push = LocalApp.current.push
    val context = LocalContext.current
    val turnOn = rememberTurnOnNotifications()
    // Back from the system settings: pick up a changed permission.
    LifecycleResumeEffect(push) {
        push.update()
        onPauseOrDispose {}
    }
    NotificationRow(
        isOn = push.isEnabled && push.isAllowed,
        isBlocked = push.isEnabled && !push.isAllowed,
        onChange = { if (it) turnOn() else push.turnOff() },
        openSettings = {
            context.startActivity(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName),
            )
        },
    )
}

/** "Notiser om nya recensioner": a switch, and a link to the system settings when they block it. */
@Composable
fun NotificationRow(isOn: Boolean, isBlocked: Boolean, onChange: (Boolean) -> Unit, openSettings: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Ess.raised, RoundedCornerShape(24.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            Modifier.fillMaxWidth().toggleable(isOn, role = Role.Switch, onValueChange = onChange),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(36.dp).background(Ess.amber.copy(alpha = 0.14f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(Ic.notifications, null, Modifier.size(18.dp), tint = Ess.amber)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Notiser om nya recensioner", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Bold))
                Text(
                    "Få en notis när en ny recension publiceras. Du kan stänga av dem här när som helst.",
                    style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText,
                )
            }
            Switch(isOn, onCheckedChange = null)
        }
        if (isBlocked) {
            Text(
                "Notiser är avstängda för appen i telefonens inställningar.",
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold), color = Ess.amber,
            )
            OutlinedButton(onClick = openSettings) { Text("Öppna inställningar") }
        }
    }
}

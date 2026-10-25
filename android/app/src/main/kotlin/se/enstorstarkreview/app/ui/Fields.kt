package se.enstorstarkreview.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp

/** A Material 3 filled field in the app's colours, with its error below. */
@Composable
fun EssTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    error: String? = null,
    icon: ImageVector? = null,
    isSecure: Boolean = false,
    minLines: Int = 1,
    container: Color = Ess.raised2,
    textStyle: TextStyle = MaterialTheme.typography.bodyLarge,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    supportingText: String? = null,
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        TextField(
            value, onValueChange,
            Modifier.fillMaxWidth().semantics { if (error != null) error(error) },
            label = { Text(label) }, textStyle = textStyle,
            leadingIcon = icon?.let { { Icon(it, null) } },
            isError = error != null, minLines = minLines, singleLine = minLines == 1,
            visualTransformation = if (isSecure) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = keyboardOptions, keyboardActions = keyboardActions,
            shape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = container, unfocusedContainerColor = container, errorContainerColor = container,
                focusedIndicatorColor = Ess.amber, unfocusedIndicatorColor = Ess.tertiaryText,
                unfocusedLabelColor = Ess.secondaryText, focusedLabelColor = Ess.amber,
                unfocusedLeadingIconColor = Ess.secondaryText, focusedLeadingIconColor = Ess.amber, cursorColor = Ess.amber,
            ),
        )
        val below = error ?: supportingText
        if (below != null) {
            Text(below, Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodySmall, color = if (error != null) Ess.bad else Ess.secondaryText)
        }
    }
}

package it.skoor.wear

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.ToggleChip
import androidx.wear.compose.material.ToggleChipDefaults

// The menu: during a match (long press, or the back gesture) with undo, other match and close;
// from the list (Settings) only the settings and unlinking. Turning the crown or bezel scrolls.
@Composable
fun MenuScreen(store: Store, inMatch: Boolean, onUndo: () -> Unit, onOtherMatch: () -> Unit, onClose: () -> Unit, onUnlink: () -> Unit) {
    val state = rememberScalingLazyListState()
    Scaffold(positionIndicator = { PositionIndicator(scalingLazyListState = state) }) {
        ScalingLazyColumn(Modifier.fillMaxSize(), state = state) {
            item { Text("SKOOR", color = Look.muted, fontSize = 11.sp, letterSpacing = 1.5.sp) }
            if (inMatch) item { MenuChip("Undo last point", onUndo) }
            item { Toggle("Touch scoring", "Tap the top or bottom half", store.touch) { store.touch = it } }
            item { Toggle("My team on top", "When you play in the match", store.myUp) { store.myUp = it } }
            item { Toggle("Interval alerts", "Interval and change ends", store.alerts) { store.alerts = it } }
            item { Toggle("Screen on", "While scoring a match", store.keepOn) { store.keepOn = it } }
            if (inMatch) {
                item { MenuChip("Other match", onOtherMatch) }
                item { MenuChip("Close Skoor", onClose, "The match goes on") }
            }
            item { MenuChip("Unlink watch", onUnlink) }
        }
    }
}

@Composable
private fun MenuChip(label: String, onClick: () -> Unit, sub: String? = null) {
    Chip(
        onClick = onClick, modifier = Modifier.fillMaxWidth(), colors = ChipDefaults.secondaryChipColors(backgroundColor = Look.card),
        label = { Text(label) }, secondaryLabel = sub?.let { { Text(it, color = Look.muted) } },
    )
}

@Composable
private fun Toggle(label: String, sub: String, initial: Boolean, onChange: (Boolean) -> Unit) {
    var on by remember { mutableStateOf(initial) }
    ToggleChip(
        checked = on, onCheckedChange = { on = it; onChange(it) }, modifier = Modifier.fillMaxWidth(),
        label = { Text(label) }, secondaryLabel = { Text(sub, color = Look.muted) },
        toggleControl = { androidx.wear.compose.material.Icon(imageVector = ToggleChipDefaults.switchIcon(on), contentDescription = if (on) "On" else "Off") },
        colors = ToggleChipDefaults.toggleChipColors(checkedEndBackgroundColor = Look.card, uncheckedStartBackgroundColor = Look.card, uncheckedEndBackgroundColor = Look.card, checkedToggleControlColor = Look.green),
    )
}

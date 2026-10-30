package it.skoor.wear

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay

// The matches being played now in your clubs, by court. It asks again when the server says
// (pollIn): soon when a court is about to come free, every 20 s while matches are played, every
// 10 s once the event is on, up to every 10 minutes with no event today. Turning the crown or
// bezel scrolls.
@Composable
fun MatchesScreen(api: Api, onOpen: (Summary) -> Unit, onSettings: () -> Unit, onUnlinked: () -> Unit) {
    var matches by remember { mutableStateOf<List<Summary>?>(null) }
    var message by remember { mutableStateOf("Loading…") }

    LaunchedEffect(Unit) {
        while (true) {
            val a = api.get("/matches")
            var wait = 15L
            when {
                a.ok -> {
                    val list = a.json!!.getJSONArray("matches")
                    matches = (0 until list.length()).map { Summary.from(list.getJSONObject(it)) }
                    wait = a.json.optLong("pollIn", 15)
                }
                a.code == 401 -> { onUnlinked(); return@LaunchedEffect }
                matches == null -> message = problem(a.code)
            }
            delay(wait * 1_000)
        }
    }

    MatchesContent(matches, message, onOpen, onSettings)
}

// What the list shows: the matches, or a message until they're known.
@Composable
fun MatchesContent(matches: List<Summary>?, message: String, onOpen: (Summary) -> Unit, onSettings: () -> Unit) {
    val state = rememberScalingLazyListState()
    Scaffold(positionIndicator = { PositionIndicator(scalingLazyListState = state) }) {
        ScalingLazyColumn(Modifier.fillMaxSize(), state = state) {
            item { Text("MATCHES NOW", color = Look.muted, fontSize = 11.sp, letterSpacing = 1.5.sp) }
            val list = matches
            when {
                list == null -> item { Text(message, color = Look.white, textAlign = TextAlign.Center) }
                list.isEmpty() -> item {
                    Text("No match being played. Start one on your phone, then choose it here.", color = Look.white, fontSize = 13.sp, textAlign = TextAlign.Center)
                }
                else -> items(list) { m ->
                    Chip(
                        onClick = { onOpen(m) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ChipDefaults.secondaryChipColors(backgroundColor = Look.card),
                        label = { Text((m.court?.let { "COURT $it  " } ?: "") + "${plain(m.tiles[0])}–${plain(m.tiles[1])}", fontFamily = Look.display, fontSize = 16.sp, color = Look.white) },
                        secondaryLabel = { Text("${firstNames(m.home)} – ${firstNames(m.away)}", maxLines = 1, overflow = TextOverflow.Ellipsis, color = Look.muted) },
                    )
                }
            }
            item {
                Chip(onClick = onSettings, modifier = Modifier.fillMaxWidth(), colors = ChipDefaults.secondaryChipColors(), label = { Text("Settings") })
            }
        }
    }
}

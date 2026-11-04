package it.skoor.wear

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.itemsIndexed
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import org.json.JSONArray
import org.json.JSONObject

// Starting a game on the watch: the sport, then the quick setup (the players of both teams, the
// game length) and Start. The game is the account's own (not a club's); the server keeps every
// point, and for timed games every start and pause of the clock.

// A sport as the server lists it (functions/watch.js, sportList()).
data class Sport(val id: String, val name: String, val timed: Boolean, val options: List<String>) {
    companion object {
        fun list(a: JSONArray) = (0 until a.length()).map { i ->
            val j = a.getJSONObject(i)
            val o = j.getJSONArray("options")
            Sport(j.getString("id"), j.getString("name"), j.optBoolean("timed"), (0 until o.length()).map { o.getJSONObject(it).getString("label") })
        }
    }
}

data class Person(val id: String, val name: String, val me: Boolean)

// What is being set up.
class GameSetup(val sport: Sport) {
    var option by mutableIntStateOf(0)
    val teams = listOf(mutableStateListOf<String>(), mutableStateListOf<String>())
    val guests = mutableStateListOf(0, 0)
    var people by mutableStateOf<List<Person>?>(null)

    // "Joris, Ann" or "No players yet": first names, and guests.
    fun teamText(team: Int): String {
        val names = teams[team].map { id -> people?.find { it.id == id }?.name?.substringBefore(' ') ?: "?" }.toMutableList()
        val g = guests[team]
        if (g > 0) names += if (g == 1) "Guest" else "$g guests"
        return if (names.isEmpty()) "No players yet" else names.joinToString(", ")
    }

    // Someone in or out of a team; in one team means out of the other.
    fun toggle(team: Int, id: String) {
        if (id in teams[team]) teams[team].remove(id) else { teams[team].add(id); teams[1 - team].remove(id) }
    }

    // Guests: one more, up to 4, then none again.
    fun addGuest(team: Int) {
        guests[team] = if (guests[team] >= 4) 0 else guests[team] + 1
    }

    // You play in HOME, unless you take yourself out.
    fun takePeople(list: List<Person>) {
        people = list
        val me = list.firstOrNull { it.me }
        if (me != null && teams[0].isEmpty() && teams[1].isEmpty()) teams[0].add(me.id)
    }

    fun body(): JSONObject = JSONObject().put("sport", sport.id).put("option", option)
        .put("home", JSONArray(teams[0].toList())).put("away", JSONArray(teams[1].toList()))
        .put("guests", JSONArray(guests.toList()))
}

fun sportIcon(id: String): Int? = when (id) {
    "badminton" -> R.drawable.sport_badminton
    "tabletennis" -> R.drawable.sport_tabletennis
    "squash" -> R.drawable.sport_squash
    "pickleball" -> R.drawable.sport_pickleball
    "beachvolleyball" -> R.drawable.sport_beachvolleyball
    "tennis" -> R.drawable.sport_tennis
    "padel" -> R.drawable.sport_padel
    "basketball" -> R.drawable.sport_basketball
    "football" -> R.drawable.sport_football
    else -> null
}

// ---------- the start ----------

// New game (green), the matches being played now in your clubs (join one to score), Settings.
@Composable
fun HomeScreen(api: Api, onNewGame: () -> Unit, onMatches: () -> Unit, onSettings: () -> Unit, onUnlinked: () -> Unit) {
    var count by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(Unit) {
        val a = api.get("/matches")
        if (a.ok) count = a.json!!.getJSONArray("matches").length() else if (a.code == 401) onUnlinked()
    }
    HomeContent(count, onNewGame, onMatches, onSettings)
}

@Composable
fun HomeContent(count: Int?, onNewGame: () -> Unit, onMatches: () -> Unit, onSettings: () -> Unit) {
    val state = rememberScalingLazyListState()
    Scaffold(positionIndicator = { PositionIndicator(scalingLazyListState = state) }) {
        ScalingLazyColumn(Modifier.fillMaxSize(), state = state) {
            item { DisplayText("SKOOR", 18.sp) }
            item {
                Chip(
                    onClick = onNewGame, modifier = Modifier.fillMaxWidth(),
                    colors = ChipDefaults.primaryChipColors(backgroundColor = Look.green),
                    label = { Text("New game", color = Look.black, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) },
                )
            }
            item {
                Chip(
                    onClick = onMatches, modifier = Modifier.fillMaxWidth(), colors = ChipDefaults.secondaryChipColors(backgroundColor = Look.card),
                    label = { Text(if (count == null) "Matches now" else "Matches now · $count", color = Look.white) },
                    secondaryLabel = { Text("Join one to score", color = Look.muted) },
                )
            }
            item { Chip(onClick = onSettings, modifier = Modifier.fillMaxWidth(), colors = ChipDefaults.secondaryChipColors(), label = { Text("Settings") }) }
        }
    }
}

// ---------- the sport ----------

// NEW GAME · SPORT: every sport with its icon; a clock for timed sports (basketball, football).
@Composable
fun SportScreen(api: Api, onChoose: (Sport) -> Unit, onUnlinked: () -> Unit) {
    var sports by remember { mutableStateOf<List<Sport>?>(null) }
    var message by remember { mutableStateOf("Loading…") }
    LaunchedEffect(Unit) {
        val a = api.get("/sports")
        when {
            a.ok -> sports = Sport.list(a.json!!.getJSONArray("sports"))
            a.code == 401 -> onUnlinked()
            else -> message = problem(a.code)
        }
    }
    SportContent(sports, message, onChoose)
}

@Composable
fun SportContent(sports: List<Sport>?, message: String, onChoose: (Sport) -> Unit) {
    val state = rememberScalingLazyListState()
    Scaffold(positionIndicator = { PositionIndicator(scalingLazyListState = state) }) {
        ScalingLazyColumn(Modifier.fillMaxSize(), state = state) {
            item { Text("NEW GAME · SPORT", color = Look.muted, fontSize = 11.sp, letterSpacing = 1.5.sp) }
            if (sports == null) item { Text(message, color = Look.white, textAlign = TextAlign.Center) }
            else items(sports) { s ->
                Chip(
                    onClick = { onChoose(s) }, modifier = Modifier.fillMaxWidth(), colors = ChipDefaults.secondaryChipColors(backgroundColor = Look.card),
                    icon = { sportIcon(s.id)?.let { Image(painterResource(it), contentDescription = null, modifier = Modifier.size(22.dp)) } },
                    label = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(s.name, color = Look.white, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            if (s.timed) Image(painterResource(R.drawable.sport_clock), contentDescription = "Timed", colorFilter = ColorFilter.tint(Look.muted), modifier = Modifier.size(14.dp))
                        }
                    },
                )
            }
            // A sport that isn't there yet: wished on the phone or the website (typing a name on a
            // watch is no fun).
            if (sports != null) item {
                Text(
                    "Your sport isn't here? Tell us on your phone: New match › Your sport isn't here?, or on skoor.it.",
                    color = Look.muted, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                )
            }
        }
    }
}

// ---------- the quick setup ----------

// The sport, HOME and AWAY with their players (tap to choose them), the game length (tap a
// chip) and Start.
@Composable
fun SetupScreen(api: Api, game: GameSetup, onTeam: (Int) -> Unit, onStarted: (JSONObject) -> Unit, onUnlinked: () -> Unit) {
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(game) {
        if (game.people == null) {
            val a = api.get("/people")
            if (a.ok) {
                val list = a.json!!.getJSONArray("people")
                game.takePeople((0 until list.length()).map { list.getJSONObject(it).let { p -> Person(p.getString("id"), p.getString("name"), p.optBoolean("me")) } })
            }
        }
    }
    var start by remember { mutableIntStateOf(0) }
    LaunchedEffect(start) {
        if (start == 0) return@LaunchedEffect
        busy = true
        problem = null
        val a = api.post("/game/start", game.body())
        busy = false
        when {
            a.ok -> onStarted(a.json!!)
            a.code == 401 -> onUnlinked()
            else -> problem = problem(a.code)
        }
    }
    SetupContent(game, busy, problem, onTeam) { if (!busy) start += 1 }
}

@Composable
fun SetupContent(game: GameSetup, busy: Boolean, problem: String?, onTeam: (Int) -> Unit, onStart: () -> Unit) {
    val state = rememberScalingLazyListState()
    Scaffold(positionIndicator = { PositionIndicator(scalingLazyListState = state) }) {
        ScalingLazyColumn(Modifier.fillMaxSize(), state = state) {
            item { Text(game.sport.name.uppercase(), color = Look.muted, fontSize = 11.sp, letterSpacing = 1.5.sp) }
            items(2) { t ->
                Chip(
                    onClick = { onTeam(t) }, modifier = Modifier.fillMaxWidth(), colors = ChipDefaults.secondaryChipColors(backgroundColor = Look.card),
                    label = { DisplayText(if (t == 0) "HOME" else "AWAY", 15.sp) },
                    secondaryLabel = { Text(game.teamText(t), color = Look.muted, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                )
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 2.dp)) {
                    // Two chips: the usual and the second, or the usual and the one chosen.
                    val shown = if (game.option < 2) listOf(0, 1) else listOf(0, game.option)
                    shown.filter { it < game.sport.options.size }.forEach { i ->
                        OptionChip(game.sport.options[i], i == game.option) { game.option = i }
                    }
                }
            }
            if (game.sport.options.size > 2) item {
                // More lengths than fit on one line: the next one by tapping here.
                Box(Modifier.padding(4.dp).clickableNoRipple { game.option = (game.option + 1) % game.sport.options.size }) {
                    Text("Other length", color = Look.muted, fontSize = 11.sp)
                }
            }
            item {
                Chip(
                    onClick = onStart, modifier = Modifier.fillMaxWidth(), colors = ChipDefaults.primaryChipColors(backgroundColor = Look.green),
                    label = { Text(if (busy) "Starting…" else "Start", color = Look.black, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) },
                )
            }
            if (problem != null) item { Text("Not started: $problem", color = Look.orange, fontSize = 12.sp, textAlign = TextAlign.Center) }
        }
    }
}

// A game length: white when chosen.
@Composable
private fun OptionChip(label: String, on: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.then(if (on) Modifier.background(Look.white, CircleShape) else Modifier.border(1.dp, Look.faint, CircleShape))
            .clickableNoRipple(onClick).padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Text(label, color = if (on) Look.black else Look.white, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

// ---------- the players of a team ----------

// HOME · PLAYERS: the people you played with lately (the same list as on your phone), each with a
// green tick when in this team; "+ Guest" adds someone without the app.
@Composable
fun TeamScreen(game: GameSetup, team: Int) {
    val state = rememberScalingLazyListState()
    Scaffold(positionIndicator = { PositionIndicator(scalingLazyListState = state) }) {
        ScalingLazyColumn(Modifier.fillMaxSize(), state = state) {
            item { Text((if (team == 0) "HOME" else "AWAY") + " · PLAYERS", color = Look.muted, fontSize = 11.sp, letterSpacing = 1.5.sp) }
            val people = game.people
            if (people == null) item { Text("Loading…", color = Look.white) }
            else itemsIndexed(people) { _, p ->
                val on = p.id in game.teams[team]
                val other = p.id in game.teams[1 - team]
                Chip(
                    onClick = { game.toggle(team, p.id) }, modifier = Modifier.fillMaxWidth(), colors = ChipDefaults.secondaryChipColors(backgroundColor = Look.card),
                    icon = { Tick(on) },
                    label = { Text(p.name + if (p.me) " (you)" else "", color = if (other) Look.muted else Look.white, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    secondaryLabel = if (other) ({ Text(if (team == 0) "In AWAY" else "In HOME", color = Look.muted) }) else null,
                )
            }
            item {
                val g = game.guests[team]
                Chip(
                    onClick = { game.addGuest(team) }, modifier = Modifier.fillMaxWidth(), colors = ChipDefaults.outlinedChipColors(),
                    border = ChipDefaults.outlinedChipBorder(borderColor = Look.faint),
                    label = { Text("+ Guest", color = Look.white, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) },
                    secondaryLabel = if (g > 0) ({ Text(if (g == 1) "1 guest now" else "$g guests now", color = Look.muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }) else null,
                )
            }
            item { Text("Played with recently", color = Look.faint, fontSize = 10.sp) }
        }
    }
}

// A green circle with a tick, or an empty circle.
@Composable
private fun Tick(on: Boolean) {
    if (on) {
        Box(Modifier.size(20.dp).background(Look.green, CircleShape), contentAlignment = Alignment.Center) {
            Text("✓", color = Look.black, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
    } else {
        Box(Modifier.size(20.dp).border(1.5.dp, Look.faint, CircleShape))
    }
}

// A tap without the ripple (for small chips and links).
fun Modifier.clickableNoRipple(onClick: () -> Unit): Modifier =
    this.then(Modifier.pointerInput(onClick) { detectTapGestures(onTap = { onClick() }) })

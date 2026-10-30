package it.skoor.wear

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Text

// One match being scored: the team on top and the team below as flip tiles, the side that serves
// in green, LIVE or OFFLINE at the top with a bar running down while the score is frozen.
// Touch (when on): tap the top half for the team on top, the bottom half for the other. A long
// press (or the back gesture) opens the menu; turning the crown or bezel does nothing here, so a
// brushed crown never changes the score. Buttons: see MainActivity.
@Composable
fun ScoreScreen(session: Session, touch: Boolean, onMenu: () -> Unit, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    val s = session.s
    @Suppress("UNUSED_VARIABLE") val tick = session.now // redraw on the session's ticks
    Box(
        Modifier.fillMaxSize().background(Look.black).pointerInput(touch, s.gameOver) {
            detectTapGestures(
                onTap = { p -> if (touch && !s.gameOver) session.point(p.y < size.height / 2, scope) },
                onLongPress = { onMenu() },
            )
        },
    ) {
        when {
            s.matchWinner != null -> MatchWon(s, onDone = onDone, onUndo = { session.press("undo", scope) })
            s.gameOver -> GameWon(s, onNext = { session.press("next", scope) }, onUndo = { session.press("undo", scope) })
            else -> Playing(session)
        }
        val card = session.card
        if (card != null && session.now < card.until) {
            StatusCard(card.title, card.line, if (card.kind == Card.Kind.REFUSED) Look.orange else Look.green)
        } else if (!session.live) {
            StatusCard("SCORING PAUSED", "No connection: checking…", Look.card)
        }
    }
}

@Composable
private fun Playing(session: Session) {
    val s = session.s
    val top = session.top
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val tile = maxHeight * 0.23f
        val half = maxWidth * 0.5f
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            LiveLabel(session.live, if (s.bestOf > 1) " · GAME ${s.gameNo}" else "")
            val left = session.frozenLeft
            Box(Modifier.height(6.dp), contentAlignment = Alignment.Center) {
                if (left > 0 && session.live) Box(Modifier.width(half * (left / 5000f)).height(3.dp).background(Look.muted))
            }
            Side(s, top, tile, nameFirst = true)
            Box(Modifier.padding(vertical = 4.dp).width(half).height(1.dp).background(Look.line))
            Side(s, 1 - top, tile, nameFirst = false)
            s.court?.let { Text("COURT $it", color = Look.faint, fontSize = 10.sp, letterSpacing = 1.sp) }
        }
    }
}

// One side: its name (green when serving), its earlier games and its flip tiles.
@Composable
private fun Side(s: Summary, team: Int, tile: androidx.compose.ui.unit.Dp, nameFirst: Boolean) {
    val serving = s.server == team
    val name = s.name(team).let { if (it.length > 16) firstNames(it) else it }.uppercase()
    val label = @Composable { DisplayText(name, 13.sp, if (serving) Look.green else Look.white, Modifier.fillMaxWidth(0.7f)) }
    if (nameFirst) label()
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        s.past.forEach { g ->
            Text("${g[team]}", color = if (g[team] > g[1 - team]) Look.white else Look.faint, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        FlipTiles(s.tiles[team], serving, tile)
    }
    if (!nameFirst) label()
}

// A game won, more to play: who won it, the score, and Next game (or a press, see MainActivity).
@Composable
private fun GameWon(s: Summary, onNext: () -> Unit, onUndo: () -> Unit) {
    val w = s.gameWinner ?: 0
    val game = s.allGames().getOrNull(s.gameNo - 1) ?: listOf(0, 0)
    Column(Modifier.fillMaxSize().padding(horizontal = 18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text("GAME ${s.gameNo}", color = Look.muted, fontSize = 11.sp, letterSpacing = 2.sp)
        DisplayText(firstNames(s.name(w)).uppercase(), 18.sp)
        DisplayText("${game[w]}–${game[1 - w]}", 40.sp)
        Text("GAMES ${s.won[0]}–${s.won[1]}", color = Look.muted, fontSize = 11.sp, letterSpacing = 1.sp)
        Spacer(Modifier.height(6.dp))
        Button(onClick = onNext, colors = ButtonDefaults.buttonColors(backgroundColor = Look.green), modifier = Modifier.fillMaxWidth(0.7f).height(36.dp), shape = RoundedCornerShape(18.dp)) {
            Text("Next game", color = Look.black, fontWeight = FontWeight.Bold)
        }
        UndoLink(onUndo)
    }
}

// The match won: who, and every game as a column (each game's winner in white), then Done.
@Composable
private fun MatchWon(s: Summary, onDone: () -> Unit, onUndo: () -> Unit) {
    val w = s.matchWinner ?: 0
    val games = s.allGames()
    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        DisplayText("${firstNames(s.name(w)).uppercase()} WIN", 18.sp)
        Spacer(Modifier.height(4.dp))
        listOf(0, 1).forEach { team ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(firstNames(s.name(team)), color = if (team == w) Look.white else Look.muted, fontSize = 12.sp, fontWeight = if (team == w) FontWeight.Bold else FontWeight.Normal, maxLines = 1, modifier = Modifier.weight(1f))
                games.forEach { g -> DisplayText("${g[team]}", 18.sp, if (g[team] > g[1 - team]) Look.white else Look.faint, Modifier.width(26.dp)) }
            }
            if (team == 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Look.line))
        }
        Text("Saved to the club", color = Look.muted, fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
        Button(onClick = onDone, colors = ButtonDefaults.outlinedButtonColors(), border = ButtonDefaults.outlinedButtonBorder(borderColor = Look.white), modifier = Modifier.fillMaxWidth(0.55f).height(32.dp), shape = RoundedCornerShape(16.dp)) {
            Text("Done", color = Look.white, fontWeight = FontWeight.Bold)
        }
        UndoLink(onUndo)
    }
}

@Composable
private fun UndoLink(onUndo: () -> Unit) {
    Box(Modifier.padding(top = 2.dp).pointerInput(Unit) { detectTapGestures(onTap = { onUndo() }) }.padding(6.dp)) {
        Text("Undo last point", color = Look.muted, fontSize = 11.sp)
    }
}

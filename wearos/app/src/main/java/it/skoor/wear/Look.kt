package it.skoor.wear

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text

// Skoor's colours and type, as on the phone, the screens and the Garmin watch.
object Look {
    val green = Color(0xFF22C55E)
    val orange = Color(0xFFF59E0B)
    val card = Color(0xFF1A1A1A)
    val line = Color(0xFF262626)
    val muted = Color(0xFF8A8A8A)
    val faint = Color(0xFF5A5A5A)
    val white = Color(0xFFFAFAFA)
    val black = Color.Black
    val display = FontFamily(Font(R.font.barlow_condensed_extrabold))
}

// A title in Skoor's display type (BARLOW CONDENSED), one line, cut short if it has to.
@Composable
fun DisplayText(text: String, size: TextUnit, color: Color = Look.white, modifier: Modifier = Modifier) {
    Text(
        text, modifier = modifier, color = color, fontFamily = Look.display, fontSize = size,
        letterSpacing = 0.04.em(size), maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
    )
}

private fun Double.em(size: TextUnit) = (this * size.value).sp

// Two flip tiles ("07"), green when that side serves.
@Composable
fun FlipTiles(text: String, serving: Boolean, height: Dp) {
    Row(horizontalArrangement = Arrangement.spacedBy(height * 0.08f)) {
        text.padStart(2).take(2).forEach { c ->
            Box(
                Modifier.size(width = height * 0.72f, height = height)
                    .background(if (serving) Look.green else Look.card, RoundedCornerShape(height * 0.14f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(c.toString(), color = if (serving) Look.black else Look.white, fontFamily = Look.display, fontSize = (height.value * 0.82f).sp)
                Box(Modifier.fillMaxWidth().height(2.dp).background(Look.black)) // the split of a flip tile
            }
        }
    }
}

// A card in the middle, over the score: orange for NOT COUNTED, green for the interval and a change
// of ends, grey for SCORING PAUSED.
@Composable
fun StatusCard(title: String, line: String, color: Color) {
    val dark = color != Look.card
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            Modifier.fillMaxWidth(0.84f).background(Look.black, RoundedCornerShape(22.dp)).padding(4.dp)
                .background(color, RoundedCornerShape(18.dp)).padding(horizontal = 10.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            DisplayText(title, 20.sp, if (dark) Look.black else Look.white)
            Text(line, color = if (dark) Look.black else Look.muted, fontSize = 12.sp, textAlign = TextAlign.Center, maxLines = 2)
        }
    }
}

// The dot and word at the top: LIVE in green, OFFLINE in orange.
@Composable
fun LiveLabel(live: Boolean, extra: String) {
    val color = if (live) Look.green else Look.orange
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(6.dp).background(color, RoundedCornerShape(3.dp)))
        Box(Modifier.width(5.dp))
        Text((if (live) "LIVE" else "OFFLINE") + extra, color = color, fontSize = 11.sp, letterSpacing = 1.sp)
    }
}

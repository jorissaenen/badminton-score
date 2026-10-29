import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;

//! Skoor's colours and the buzzes, the same on every screen of the app.
module Look {
    // For AMOLED screens. MIP screens (Fenix 6, Forerunner 255/955, Instinct…) show only 64
    // colours, where these dark greys would turn black: setup() swaps in the nearest of those.
    var GREEN as Number = 0x22C55E;
    var ORANGE as Number = 0xF59E0B;
    var CARD as Number = 0x1A1A1A;
    var LINE as Number = 0x262626;
    var MUTED as Number = 0x8A8A8A;
    var FAINT as Number = 0x5A5A5A;
    var WHITE as Number = 0xFAFAFA;
    const BLACK = 0x000000;

    function setup() as Void {
        var settings = System.getDeviceSettings();
        if ((settings has :requiresBurnInProtection) && settings.requiresBurnInProtection) {
            return; // AMOLED
        }
        GREEN = 0x00AA55;
        ORANGE = 0xFFAA00;
        CARD = 0x555555;
        LINE = 0x555555;
        MUTED = 0xAAAAAA;
        FAINT = 0xAAAAAA; // 0x555555 would vanish on a card
        WHITE = 0xFFFFFF;
    }

    function vibrate(pattern as Array<Number>) as Void {
        if (!(Attention has :vibrate)) {
            return;
        }
        var profiles = [] as Array<Attention.VibeProfile>;
        for (var i = 0; i < pattern.size(); i += 2) {
            profiles.add(new Attention.VibeProfile(pattern[i], pattern[i + 1]));
        }
        Attention.vibrate(profiles);
    }

    //! A point counted.
    function buzzPoint() as Void { vibrate([60, 60]); }
    //! A game won.
    function buzzGame() as Void { vibrate([80, 100, 0, 80, 80, 100]); }
    //! The match won, or the watch linked.
    function buzzDone() as Void { vibrate([100, 500]); }
    //! Not counted: low and double, different from a point.
    function buzzRefused() as Void { vibrate([100, 90, 0, 70, 100, 90]); }

    //! A text in the middle of x, with its middle at y.
    function text(dc as Graphics.Dc, x as Numeric, y as Numeric, font as Graphics.FontType, s as String, color as Number) as Void {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x.toNumber(), y.toNumber(), font, s, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    //! A text starting at x (left-aligned), with its middle at y.
    function textLeft(dc as Graphics.Dc, x as Numeric, y as Numeric, font as Graphics.FontType, s as String, color as Number) as Void {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x.toNumber(), y.toNumber(), font, s, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    //! How wide the screen is at height y, less a margin on both sides: on a round screen less
    //! near the top and the bottom.
    function widthAt(dc as Graphics.Dc, y as Numeric, margin as Number) as Number {
        var w = dc.getWidth();
        if (System.getDeviceSettings().screenShape != System.SCREEN_SHAPE_ROUND) {
            return w - 2 * margin;
        }
        var r = w / 2.0;
        var dy = y - dc.getHeight() / 2.0;
        var half = dy * dy < r * r ? Math.sqrt(r * r - dy * dy) : 0;
        return (2 * half).toNumber() - 2 * margin;
    }

    //! "Joris Saenen & Maarten Loyens" → "Joris & Maarten".
    function firstNames(side as String) as String {
        var out = "";
        var rest = side;
        while (true) {
            var amp = rest.find(" & ");
            var part = amp == null ? rest : rest.substring(0, amp) as String;
            var space = part.find(" ");
            out += space == null ? part : part.substring(0, space) as String;
            if (amp == null) {
                return out;
            }
            out += " & ";
            rest = rest.substring(amp + 3, rest.length()) as String;
        }
        return out;
    }

    //! The text, cut short with "…" when it is wider than maxW.
    function cut(dc as Graphics.Dc, s as String, font as Graphics.FontType, maxW as Number) as String {
        if (dc.getTextWidthInPixels(s, font) <= maxW) {
            return s;
        }
        for (var n = s.length() - 1; n > 1; n--) {
            var t = (s.substring(0, n) as String) + "…";
            if (dc.getTextWidthInPixels(t, font) <= maxW) {
                return t;
            }
        }
        return "…";
    }

    //! A side's name that fits in maxW: the full names, else first names, else first names cut short.
    function name(dc as Graphics.Dc, side as String, font as Graphics.FontType, maxW as Number, upper as Boolean) as String {
        var full = upper ? side.toUpper() : side;
        if (dc.getTextWidthInPixels(full, font) <= maxW) {
            return full;
        }
        var first = firstNames(side);
        return cut(dc, upper ? first.toUpper() : first, font, maxW);
    }

    //! Marks on the edge next to the START (top right) and BACK (bottom right) buttons, so the
    //! hints on screen point at the button to press. Round screens only.
    function buttonMarks(dc as Graphics.Dc, startColor as Number?, backColor as Number?) as Void {
        if (System.getDeviceSettings().screenShape != System.SCREEN_SHAPE_ROUND) {
            return;
        }
        var c = dc.getWidth() / 2;
        dc.setPenWidth(6);
        if (startColor != null) {
            dc.setColor(startColor, Graphics.COLOR_TRANSPARENT);
            dc.drawArc(c, c, c - 3, Graphics.ARC_COUNTER_CLOCKWISE, 22, 38);
        }
        if (backColor != null) {
            dc.setColor(backColor, Graphics.COLOR_TRANSPARENT);
            dc.drawArc(c, c, c - 3, Graphics.ARC_COUNTER_CLOCKWISE, 322, 338);
        }
        dc.setPenWidth(1);
    }

    //! A card in the middle of the screen with a big title and a line under it: orange for "Not
    //! counted", grey (CARD) for "Scoring paused", green for the interval and change of ends.
    function card(dc as Graphics.Dc, title as String, line as String, color as Number) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cw = (w * 0.82).toNumber();
        var ch = (h * 0.30).toNumber();
        var x = (w - cw) / 2;
        var y = (h - ch) / 2;
        dc.setColor(BLACK, BLACK);
        dc.fillRoundedRectangle(x - 4, y - 4, cw + 8, ch + 8, 18);
        dc.setColor(color, color);
        dc.fillRoundedRectangle(x, y, cw, ch, 14);
        var dark = color != CARD; // black text on orange and green
        text(dc, w / 2, y + ch * 0.34, Graphics.FONT_SMALL, title, dark ? BLACK : WHITE);
        text(dc, w / 2, y + ch * 0.70, Graphics.FONT_XTINY, line, dark ? BLACK : MUTED);
    }
}

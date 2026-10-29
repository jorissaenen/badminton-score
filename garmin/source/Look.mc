import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
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

    //! A card in the middle of the screen with a big title and a line under it: orange for "Not
    //! counted", grey for "Scoring paused".
    function card(dc as Graphics.Dc, title as String, line as String, orange as Boolean) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cw = (w * 0.82).toNumber();
        var ch = (h * 0.30).toNumber();
        var x = (w - cw) / 2;
        var y = (h - ch) / 2;
        dc.setColor(BLACK, BLACK);
        dc.fillRoundedRectangle(x - 4, y - 4, cw + 8, ch + 8, 18);
        dc.setColor(orange ? ORANGE : CARD, orange ? ORANGE : CARD);
        dc.fillRoundedRectangle(x, y, cw, ch, 14);
        var fg = orange ? BLACK : WHITE;
        text(dc, w / 2, y + ch * 0.34, Graphics.FONT_SMALL, title, fg);
        text(dc, w / 2, y + ch * 0.70, Graphics.FONT_XTINY, line, orange ? BLACK : MUTED);
    }
}

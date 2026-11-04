import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

//! The start: a new game (any sport, started here), the matches being played now in your clubs
//! (join one to score it), and the settings. UP / DOWN choose, START opens, BACK closes the app.
class HomeView extends WatchUi.View {
    var selected as Number = 0; // 0 new game, 1 matches now, 2 settings
    private var _count as Number? = null; // matches being played now; null until known

    function initialize() {
        View.initialize();
    }

    function onShow() as Void {
        Api.get("/matches", null, method(:onMatches));
    }

    function onMatches(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 && data instanceof Dictionary) {
            _count = (data["matches"] as Array).size();
            WatchUi.requestUpdate();
        } else if (code == 401) {
            unlinked();
        }
    }

    //! The row at height y (for a tap), or -1.
    function rowAt(y as Number, h as Number) as Number {
        if (y < h * 0.47) {
            return 0;
        }
        return y < h * 0.70 ? 1 : 2;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Look.BLACK, Look.BLACK);
        dc.clear();
        Look.text(dc, w / 2, h * 0.20, Graphics.FONT_SMALL, "SKOOR", Look.WHITE);

        // New game: the green button.
        var bw = (w * 0.70).toNumber();
        var bh = (h * 0.16).toNumber();
        var x = (w - bw) / 2;
        var y = (h * 0.30).toNumber();
        dc.setColor(Look.GREEN, Look.GREEN);
        dc.fillRoundedRectangle(x, y, bw, bh, bh / 2);
        Look.text(dc, w / 2, y + bh / 2, Graphics.FONT_TINY, "New game", Look.BLACK);
        if (selected == 0) {
            Look.outline(dc, x - 3, y - 3, bw + 6, bh + 6, bh / 2 + 3);
        }

        // Matches now: a card with how many.
        var ch = (h * 0.19).toNumber();
        y = (h * 0.50).toNumber();
        dc.setColor(Look.CARD, Look.CARD);
        dc.fillRoundedRectangle(x, y, bw, ch, 14);
        var title = _count == null ? "Matches now" : "Matches now · " + (_count as Number).toString();
        Look.text(dc, w / 2, y + ch * 0.36, Graphics.FONT_XTINY, title, Look.WHITE);
        Look.text(dc, w / 2, y + ch * 0.72, Graphics.FONT_XTINY, "Join one to score", Look.MUTED);
        if (selected == 1) {
            Look.outline(dc, x, y, bw, ch, 14);
        }

        Look.text(dc, w / 2, h * 0.80, Graphics.FONT_XTINY, "Settings", selected == 2 ? Look.WHITE : Look.MUTED);
        if (selected == 2) {
            var tw = dc.getTextWidthInPixels("Settings", Graphics.FONT_XTINY);
            dc.setColor(Look.WHITE, Look.WHITE);
            dc.fillRectangle(w / 2 - tw / 2, (h * 0.80).toNumber() + 10, tw, 2);
        }
        Look.buttonMarks(dc, Look.GREEN, null);
    }
}

class HomeDelegate extends WatchUi.BehaviorDelegate {
    private var _view as HomeView;

    function initialize(view as HomeView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onKey(evt as WatchUi.KeyEvent) as Boolean {
        var key = evt.getKey();
        if (key == WatchUi.KEY_UP || key == WatchUi.KEY_DOWN) {
            _view.selected = (_view.selected + (key == WatchUi.KEY_DOWN ? 1 : 2)) % 3;
            WatchUi.requestUpdate();
            return true;
        }
        if (key == WatchUi.KEY_ENTER) {
            open(_view.selected);
            return true;
        }
        return false;
    }

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        open(_view.rowAt(evt.getCoordinates()[1], System.getDeviceSettings().screenHeight));
        return true;
    }

    function onMenu() as Boolean {
        Menus.showLinked();
        return true;
    }

    function open(row as Number) as Void {
        if (row == 0) {
            var sports = new SportView();
            WatchUi.pushView(sports, new SportDelegate(sports), WatchUi.SLIDE_LEFT);
        } else if (row == 1) {
            var list = new MatchesView();
            WatchUi.pushView(list, new MatchesDelegate(list), WatchUi.SLIDE_LEFT);
        } else {
            Menus.showLinked();
        }
    }
}

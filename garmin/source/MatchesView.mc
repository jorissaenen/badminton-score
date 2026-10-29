import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

//! The matches being played now in your clubs, by court. UP and DOWN choose, START opens one (or tap
//! it). Refreshes every 10 seconds. Matches are started on a phone; then anyone can score them here.
class MatchesView extends WatchUi.View {
    var matches as Array? = null; // null: loading
    var selected as Number = 0;
    private var _message as String = "Loading…";
    private var _busy as Boolean = false;
    private var _timer as Timer.Timer?;

    function initialize() {
        View.initialize();
    }

    //! The server says when to ask again (pollIn): soon when a court is about to come free, every
    //! 20 s while matches are being played, every 10 s once the event is on, up to every 10 minutes
    //! with no event today. Until it has answered: every 15 s.
    private var _pollIn as Number = 15;

    function onShow() as Void {
        _timer = new Timer.Timer();
        load();
    }

    function again() as Void {
        if (_timer != null) {
            _timer.stop();
            _timer.start(method(:load), _pollIn * 1000, false);
        }
    }

    function onHide() as Void {
        if (_timer != null) {
            _timer.stop();
            _timer = null; // an answer arriving later doesn't start it again
        }
    }

    function load() as Void {
        if (_busy) {
            return;
        }
        if (!System.getDeviceSettings().phoneConnected && matches == null) {
            _message = Api.problem(Communications.BLE_CONNECTION_UNAVAILABLE);
            WatchUi.requestUpdate();
        }
        again(); // in case this one gets no answer
        _busy = true;
        Api.get("/matches", null, method(:onMatches));
    }

    function onMatches(code as Number, data as Dictionary or String or Null) as Void {
        _busy = false;
        if (code == 200 && data instanceof Dictionary) {
            var list = data["matches"] as Array;
            matches = list;
            if (selected >= list.size()) {
                selected = 0;
            }
            if (data["pollIn"] instanceof Number) {
                _pollIn = data["pollIn"] as Number;
                again();
            }
        } else if (code == 401) {
            unlinked();
            return;
        } else if (matches == null) {
            _message = Api.problem(code);
        }
        WatchUi.requestUpdate();
    }

    //! The selected match, or null.
    function current() as Dictionary? {
        if (matches == null || matches.size() == 0) {
            return null;
        }
        return matches[selected] as Dictionary;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Look.BLACK, Look.BLACK);
        dc.clear();
        Look.text(dc, w / 2, (h * 0.12).toNumber(), Graphics.FONT_XTINY, "MATCHES NOW", Look.MUTED);
        if (matches == null) {
            Look.text(dc, w / 2, h / 2, Graphics.FONT_TINY, _message, Look.WHITE);
            return;
        }
        var list = matches as Array;
        if (list.size() == 0) {
            Look.text(dc, w / 2, (h * 0.42).toNumber(), Graphics.FONT_TINY, "No match being played", Look.WHITE);
            Look.text(dc, w / 2, (h * 0.56).toNumber(), Graphics.FONT_XTINY, "Start one on your phone,", Look.MUTED);
            Look.text(dc, w / 2, (h * 0.64).toNumber(), Graphics.FONT_XTINY, "then choose it here", Look.MUTED);
            return;
        }
        // Up to three rows, the selected one in the middle with a white outline.
        var rowH = (h * 0.22).toNumber();
        var first = selected - 1;
        if (first < 0) {
            first = 0;
        }
        if (first > list.size() - 3 && list.size() >= 3) {
            first = list.size() - 3;
        }
        var y = (h * 0.20).toNumber();
        var rw = (w * 0.80).toNumber();
        for (var i = first; i < list.size() && i < first + 3; i++) {
            var m = list[i] as Dictionary;
            var x = (w - rw) / 2;
            dc.setColor(Look.CARD, Look.CARD);
            dc.fillRoundedRectangle(x, y, rw, rowH - 6, 12);
            if (i == selected) {
                dc.setColor(Look.WHITE, Look.WHITE);
                dc.setPenWidth(2);
                dc.drawRoundedRectangle(x, y, rw, rowH - 6, 12);
            }
            var tiles = m["tiles"] as Array;
            var court = m["court"] == null ? "" : "COURT " + (m["court"] as Number).toString() + "  ";
            Look.text(dc, w / 2, y + (rowH - 6) * 0.32, Graphics.FONT_TINY, court + Score.plain(tiles[0] as String) + "–" + Score.plain(tiles[1] as String), Look.WHITE);
            // Both sides on one line, as long as fits in the row: full names, else first names.
            var half = (rw - 24 - dc.getTextWidthInPixels(" – ", Graphics.FONT_XTINY)) / 2;
            var names = Look.name(dc, m["home"] as String, Graphics.FONT_XTINY, half, false) + " – " + Look.name(dc, m["away"] as String, Graphics.FONT_XTINY, half, false);
            Look.text(dc, w / 2, y + (rowH - 6) * 0.72, Graphics.FONT_XTINY, names, Look.WHITE);
            y += rowH;
        }
    }
}

//! UP / DOWN choose, START (or a tap) opens, BACK closes the app. Hold UP (menu): unlink the watch.
class MatchesDelegate extends WatchUi.BehaviorDelegate {
    private var _view as MatchesView;

    function initialize(view as MatchesView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onKey(evt as WatchUi.KeyEvent) as Boolean {
        var key = evt.getKey();
        var list = _view.matches;
        if (list == null) {
            return false;
        }
        if (key == WatchUi.KEY_UP && _view.selected > 0) {
            _view.selected -= 1;
            WatchUi.requestUpdate();
            return true;
        }
        if (key == WatchUi.KEY_DOWN && _view.selected < list.size() - 1) {
            _view.selected += 1;
            WatchUi.requestUpdate();
            return true;
        }
        if (key == WatchUi.KEY_ENTER) {
            open();
            return true;
        }
        return false;
    }

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        open();
        return true;
    }

    function onMenu() as Boolean {
        Menus.showLinked();
        return true;
    }

    function open() as Void {
        var m = _view.current();
        if (m == null) {
            return;
        }
        var view = new ScoreView(m["club"] as String, m["match"] as String, m);
        WatchUi.pushView(view, new ScoreDelegate(view), WatchUi.SLIDE_LEFT);
    }
}

//! The watch was unlinked in the app (You → Watches): forget its key and show the QR code again.
function unlinked() as Void {
    Api.setToken(null);
    WatchUi.switchToView(new LinkView(), new LinkDelegate(), WatchUi.SLIDE_RIGHT);
}

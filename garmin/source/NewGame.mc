import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

//! Starting a game on the watch: the sport, then the quick setup (the players of both teams, the
//! game length) and Start. The game is the account's own (not a club's); the server keeps every
//! point, and for timed games every start and pause of the clock.

//! What is being set up.
class GameSetup {
    var sport as Dictionary; // from /sports: id, name, timed, options [{label…}]
    var option as Number = 0;
    var teams as Array = [[], []]; // ids of the players of each team
    var guests as Array = [0, 0];
    var people as Array? = null; // from /people: [{id, name, me}]

    function initialize(s as Dictionary) {
        sport = s;
    }

    function options() as Array {
        return sport["options"] as Array;
    }

    //! The name of someone, from the people list.
    function nameOf(id as String) as String {
        if (people != null) {
            for (var i = 0; i < (people as Array).size(); i++) {
                var p = (people as Array)[i] as Dictionary;
                if (id.equals(p["id"] as String)) {
                    return p["name"] as String;
                }
            }
        }
        return "?";
    }

    //! "Joris, Ann" or "No players yet": first names and guests.
    function teamText(team as Number) as String {
        var ids = teams[team] as Array;
        var out = "";
        for (var i = 0; i < ids.size(); i++) {
            out += (out.equals("") ? "" : ", ") + Look.firstNames(nameOf(ids[i] as String));
        }
        var g = guests[team] as Number;
        if (g > 0) {
            out += (out.equals("") ? "" : ", ") + (g == 1 ? "Guest" : g.toString() + " guests");
        }
        return out.equals("") ? "No players yet" : out;
    }

    //! Someone in or out of a team; in one team means out of the other.
    function toggle(team as Number, id as String) as Void {
        var mine = teams[team] as Array;
        if (mine.indexOf(id) >= 0) {
            mine.remove(id);
        } else {
            mine.add(id);
            (teams[1 - team] as Array).remove(id);
        }
    }
}

//! The icon of a sport (24 px, white), or null.
function sportIcon(id as String) as WatchUi.BitmapResource? {
    var ids = {
        "badminton" => Rez.Drawables.Sport_badminton, "tabletennis" => Rez.Drawables.Sport_tabletennis,
        "squash" => Rez.Drawables.Sport_squash, "pickleball" => Rez.Drawables.Sport_pickleball,
        "beachvolleyball" => Rez.Drawables.Sport_beachvolleyball, "tennis" => Rez.Drawables.Sport_tennis,
        "padel" => Rez.Drawables.Sport_padel, "basketball" => Rez.Drawables.Sport_basketball,
        "football" => Rez.Drawables.Sport_football
    };
    var r = ids[id];
    return r == null ? null : WatchUi.loadResource(r as ResourceId) as WatchUi.BitmapResource;
}

//! Rows that scroll: up to `shown` around the selected one, each with a card and a white outline
//! when selected. Draws row i with draw(dc, i, x, y, w, h).
function drawRows(dc as Graphics.Dc, count as Number, selected as Number, shown as Number, top as Number, rowH as Number, rowW as Number, draw as Method) as Void {
    var w = dc.getWidth();
    var first = selected - shown / 2;
    if (first > count - shown) {
        first = count - shown;
    }
    if (first < 0) {
        first = 0;
    }
    var x = (w - rowW) / 2;
    for (var i = first; i < count && i < first + shown; i++) {
        var y = top + (i - first) * rowH;
        dc.setColor(Look.CARD, Look.CARD);
        dc.fillRoundedRectangle(x, y, rowW, rowH - 5, 12);
        draw.invoke(dc, i, x, y, rowW, rowH - 5);
        if (i == selected) {
            Look.outline(dc, x, y, rowW, rowH - 5, 12);
        }
    }
}

// ---------- the sport ----------

//! NEW GAME · SPORT: every sport, with its icon; a clock for timed sports (basketball, football).
class SportView extends WatchUi.View {
    var sports as Array? = null;
    var selected as Number = 0;
    private var _message as String = "Loading…";

    function initialize() {
        View.initialize();
        var kept = Application.Storage.getValue("sports");
        if (kept instanceof Array) {
            sports = kept;
        }
    }

    function onShow() as Void {
        Api.get("/sports", null, method(:onSports));
    }

    function onSports(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 && data instanceof Dictionary) {
            sports = data["sports"] as Array;
            Application.Storage.setValue("sports", sports as Application.Storage.ValueType);
        } else if (code == 401) {
            unlinked();
            return;
        } else if (sports == null) {
            _message = Api.problem(code);
        }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Look.BLACK, Look.BLACK);
        dc.clear();
        Look.text(dc, w / 2, h * 0.13, Graphics.FONT_XTINY, "NEW GAME · SPORT", Look.MUTED);
        if (sports == null) {
            Look.text(dc, w / 2, h / 2, Graphics.FONT_TINY, _message, Look.WHITE);
            return;
        }
        drawRows(dc, (sports as Array).size(), selected, 4, (h * 0.21).toNumber(), (h * 0.165).toNumber(), (w * 0.80).toNumber(), method(:drawSport));
    }

    function drawSport(dc as Graphics.Dc, i as Number, x as Number, y as Number, rw as Number, rh as Number) as Void {
        var s = (sports as Array)[i] as Dictionary;
        var icon = sportIcon(s["id"] as String);
        if (icon != null) {
            dc.drawBitmap(x + 12, y + (rh - 24) / 2, icon);
        }
        Look.textLeft(dc, x + 44, y + rh / 2, Graphics.FONT_TINY, s["name"] as String, Look.WHITE);
        if (s["timed"] == true) {
            dc.drawBitmap(x + rw - 28, y + (rh - 16) / 2, WatchUi.loadResource(Rez.Drawables.Clock) as WatchUi.BitmapResource);
        }
    }
}

//! UP / DOWN choose, START (or a tap) takes the sport, BACK goes back.
class SportDelegate extends WatchUi.BehaviorDelegate {
    private var _view as SportView;

    function initialize(view as SportView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onKey(evt as WatchUi.KeyEvent) as Boolean {
        var list = _view.sports;
        if (list == null) {
            return false;
        }
        var key = evt.getKey();
        if (key == WatchUi.KEY_UP || key == WatchUi.KEY_DOWN) {
            var n = (list as Array).size();
            _view.selected = (_view.selected + (key == WatchUi.KEY_DOWN ? 1 : n - 1)) % n;
            WatchUi.requestUpdate();
            return true;
        }
        if (key == WatchUi.KEY_ENTER) {
            choose();
            return true;
        }
        return false;
    }

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        choose();
        return true;
    }

    function choose() as Void {
        if (_view.sports == null) {
            return;
        }
        var setup = new SetupView(new GameSetup((_view.sports as Array)[_view.selected] as Dictionary));
        WatchUi.pushView(setup, new SetupDelegate(setup), WatchUi.SLIDE_LEFT);
    }
}

// ---------- the quick setup ----------

//! The sport, HOME and AWAY with their players (START opens a team), the game length (START shows
//! the next) and Start. You start in HOME.
class SetupView extends WatchUi.View {
    var game as GameSetup;
    var selected as Number = 3; // 0 home, 1 away, 2 length, 3 Start
    var busy as Boolean = false;
    var problem as String? = null;

    function initialize(g as GameSetup) {
        View.initialize();
        game = g;
    }

    function onShow() as Void {
        if (game.people == null) {
            Api.get("/people", null, method(:onPeople));
        }
    }

    function onPeople(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 && data instanceof Dictionary) {
            game.people = data["people"] as Array;
            // You play in HOME, unless you take yourself out.
            var you = (game.people as Array).size() > 0 ? (game.people as Array)[0] as Dictionary : null;
            if (you != null && you["me"] == true && (game.teams[0] as Array).size() == 0 && (game.teams[1] as Array).size() == 0) {
                (game.teams[0] as Array).add(you["id"] as String);
            }
            WatchUi.requestUpdate();
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Look.BLACK, Look.BLACK);
        dc.clear();
        Look.text(dc, w / 2, h * 0.15, Graphics.FONT_XTINY, (game.sport["name"] as String).toUpper(), Look.MUTED);
        var rw = (w * 0.80).toNumber();
        var x = (w - rw) / 2;
        var rh = (h * 0.14).toNumber();
        for (var t = 0; t < 2; t++) {
            var y = (h * (t == 0 ? 0.23 : 0.39)).toNumber();
            dc.setColor(Look.CARD, Look.CARD);
            dc.fillRoundedRectangle(x, y, rw, rh, 12);
            Look.textLeft(dc, x + 12, y + rh / 2, Graphics.FONT_XTINY, t == 0 ? "HOME" : "AWAY", Look.WHITE);
            var room = rw - 12 - 56 - 22;
            Look.textLeft(dc, x + 64, y + rh / 2, Graphics.FONT_XTINY, Look.cut(dc, game.teamText(t), Graphics.FONT_XTINY, room), Look.MUTED);
            Look.text(dc, x + rw - 14, y + rh / 2, Graphics.FONT_XTINY, ">", Look.MUTED);
            if (selected == t) {
                Look.outline(dc, x, y, rw, rh, 12);
            }
        }
        // The game length: a white chip (the one chosen); START shows the next.
        var label = ((game.options()[game.option] as Dictionary)["label"] as String);
        var more = game.options().size() > 1 ? "  >" : "";
        var cw = dc.getTextWidthInPixels(label + more, Graphics.FONT_XTINY) + 24;
        var cy = (h * 0.56).toNumber();
        var ch = (h * 0.11).toNumber();
        dc.setColor(Look.WHITE, Look.WHITE);
        dc.fillRoundedRectangle(w / 2 - cw / 2, cy, cw, ch, ch / 2);
        Look.text(dc, w / 2, cy + ch / 2, Graphics.FONT_XTINY, label + more, Look.BLACK);
        if (selected == 2) {
            Look.outline(dc, w / 2 - cw / 2 - 4, cy - 4, cw + 8, ch + 8, ch / 2 + 4);
        }
        // Start.
        var bw = (w * 0.62).toNumber();
        var by = (h * 0.71).toNumber();
        var bh = (h * 0.14).toNumber();
        dc.setColor(Look.GREEN, Look.GREEN);
        dc.fillRoundedRectangle((w - bw) / 2, by, bw, bh, bh / 2);
        Look.text(dc, w / 2, by + bh / 2, Graphics.FONT_TINY, busy ? "Starting…" : "Start", Look.BLACK);
        if (selected == 3) {
            Look.outline(dc, (w - bw) / 2 - 4, by - 4, bw + 8, bh + 8, bh / 2 + 4);
        }
        if (problem != null) {
            Look.card(dc, "NOT STARTED", problem as String, Look.ORANGE);
        }
        Look.buttonMarks(dc, Look.GREEN, Look.MUTED);
    }

    function start() as Void {
        if (busy) {
            return;
        }
        busy = true;
        problem = null;
        WatchUi.requestUpdate();
        Api.post("/game/start", {
            "sport" => game.sport["id"], "option" => game.option,
            "home" => game.teams[0], "away" => game.teams[1], "guests" => game.guests
        }, method(:onStarted));
    }

    function onStarted(code as Number, data as Dictionary or String or Null) as Void {
        busy = false;
        if (code == 200 && data instanceof Dictionary) {
            Look.buzzPoint();
            // The game takes the place of the setup and the sport list: BACK from it leads home.
            WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
            openGame(data, true);
            return;
        }
        if (code == 401) {
            unlinked();
            return;
        }
        problem = Api.problem(code);
        Look.buzzRefused();
        WatchUi.requestUpdate();
    }
}

//! A game or match to score: the timed screen for timed games, the score screen otherwise.
//! replace: instead of the view on top (the sport list), else on top of it.
function openGame(m as Dictionary, replace as Boolean) as Void {
    var club = m["club"] as String;
    var id = m["match"] as String;
    if ("timed".equals(m["kind"] as String?)) {
        var t = new TimedView(club, id, m);
        if (replace) {
            WatchUi.switchToView(t, new TimedDelegate(t), WatchUi.SLIDE_LEFT);
        } else {
            WatchUi.pushView(t, new TimedDelegate(t), WatchUi.SLIDE_LEFT);
        }
        return;
    }
    var v = new ScoreView(club, id, m);
    if (replace) {
        WatchUi.switchToView(v, new ScoreDelegate(v), WatchUi.SLIDE_LEFT);
    } else {
        WatchUi.pushView(v, new ScoreDelegate(v), WatchUi.SLIDE_LEFT);
    }
}

//! UP / DOWN move, START opens a team, shows the next length, or starts; BACK goes back.
class SetupDelegate extends WatchUi.BehaviorDelegate {
    private var _view as SetupView;

    function initialize(view as SetupView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onKey(evt as WatchUi.KeyEvent) as Boolean {
        var key = evt.getKey();
        if (key == WatchUi.KEY_UP || key == WatchUi.KEY_DOWN) {
            _view.selected = (_view.selected + (key == WatchUi.KEY_DOWN ? 1 : 3)) % 4;
            _view.problem = null;
            WatchUi.requestUpdate();
            return true;
        }
        if (key == WatchUi.KEY_ENTER) {
            choose(_view.selected);
            return true;
        }
        return false;
    }

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        var y = evt.getCoordinates()[1];
        var h = System.getDeviceSettings().screenHeight;
        choose(y < h * 0.37 ? 0 : y < h * 0.53 ? 1 : y < h * 0.69 ? 2 : 3);
        return true;
    }

    function choose(row as Number) as Void {
        _view.selected = row;
        _view.problem = null;
        if (row < 2) {
            var team = new TeamView(_view.game, row);
            WatchUi.pushView(team, new TeamDelegate(team), WatchUi.SLIDE_LEFT);
        } else if (row == 2) {
            _view.game.option = (_view.game.option + 1) % _view.game.options().size();
        } else {
            _view.start();
        }
        WatchUi.requestUpdate();
    }
}

// ---------- the players of a team ----------

//! HOME · PLAYERS: the people you played with lately (the same list as on your phone), each with a
//! green tick when in this team; "+ Guest" adds someone without the app (up to 4, then none again).
class TeamView extends WatchUi.View {
    var game as GameSetup;
    var team as Number;
    var selected as Number = 0;

    function initialize(g as GameSetup, t as Number) {
        View.initialize();
        game = g;
        team = t;
    }

    function count() as Number {
        return (game.people == null ? 0 : (game.people as Array).size()) + 1;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Look.BLACK, Look.BLACK);
        dc.clear();
        Look.text(dc, w / 2, h * 0.13, Graphics.FONT_XTINY, (team == 0 ? "HOME" : "AWAY") + " · PLAYERS", Look.MUTED);
        if (game.people == null) {
            Look.text(dc, w / 2, h / 2, Graphics.FONT_TINY, "Loading…", Look.WHITE);
            return;
        }
        drawRows(dc, count(), selected, 4, (h * 0.20).toNumber(), (h * 0.15).toNumber(), (w * 0.80).toNumber(), method(:drawPerson));
        Look.text(dc, w / 2, h * 0.84, Graphics.FONT_XTINY, "Played with recently", Look.FAINT);
    }

    function drawPerson(dc as Graphics.Dc, i as Number, x as Number, y as Number, rw as Number, rh as Number) as Void {
        var people = game.people as Array;
        if (i == people.size()) {
            var g = game.guests[team] as Number;
            Look.text(dc, x + rw / 2, y + rh / 2, Graphics.FONT_XTINY, g == 0 ? "+ Guest" : "+ Guest  (" + g.toString() + " now)", Look.WHITE);
            return;
        }
        var p = people[i] as Dictionary;
        var id = p["id"] as String;
        var on = (game.teams[team] as Array).indexOf(id) >= 0;
        var other = (game.teams[1 - team] as Array).indexOf(id) >= 0;
        var cx = x + 20;
        var cy = y + rh / 2;
        if (on) {
            dc.setColor(Look.GREEN, Look.GREEN);
            dc.fillCircle(cx, cy, 8);
            dc.setColor(Look.BLACK, Look.BLACK);
            dc.setPenWidth(2);
            dc.drawLine(cx - 4, cy, cx - 1, cy + 3);
            dc.drawLine(cx - 1, cy + 3, cx + 4, cy - 3);
            dc.setPenWidth(1);
        } else {
            dc.setColor(Look.MUTED, Graphics.COLOR_TRANSPARENT);
            dc.drawCircle(cx, cy, 8);
        }
        var name = (p["name"] as String) + (p["me"] == true ? " (you)" : "");
        var note = other ? (team == 0 ? " · AWAY" : " · HOME") : "";
        Look.textLeft(dc, x + 36, cy, Graphics.FONT_XTINY, Look.cut(dc, name, Graphics.FONT_XTINY, rw - 44 - dc.getTextWidthInPixels(note, Graphics.FONT_XTINY)) + note, other ? Look.MUTED : Look.WHITE);
    }

    function choose() as Void {
        var people = game.people;
        if (people == null) {
            return;
        }
        if (selected == (people as Array).size()) {
            var g = game.guests[team] as Number;
            game.guests[team] = g >= 4 ? 0 : g + 1;
        } else {
            game.toggle(team, ((people as Array)[selected] as Dictionary)["id"] as String);
        }
        WatchUi.requestUpdate();
    }
}

//! UP / DOWN move, START ticks or unticks (or a tap), BACK is done.
class TeamDelegate extends WatchUi.BehaviorDelegate {
    private var _view as TeamView;

    function initialize(view as TeamView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onKey(evt as WatchUi.KeyEvent) as Boolean {
        var key = evt.getKey();
        if (key == WatchUi.KEY_UP || key == WatchUi.KEY_DOWN) {
            var n = _view.count();
            _view.selected = (_view.selected + (key == WatchUi.KEY_DOWN ? 1 : n - 1)) % n;
            WatchUi.requestUpdate();
            return true;
        }
        if (key == WatchUi.KEY_ENTER) {
            _view.choose();
            return true;
        }
        return false;
    }

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        _view.choose();
        return true;
    }
}

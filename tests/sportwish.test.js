import { test } from 'node:test';
import assert from 'node:assert/strict';
import { match, valid, clean, place, distance } from '../functions/sportwish.js';

const key = (name, others) => match(name, others).key;

test('names of the same sport end up together: UK and US English, Dutch, short forms', () => {
  for (const n of ['Football', 'soccer', 'Voetbal', 'FÚTBOL', 'footy']) assert.equal(key(n), 'football', n);
  for (const n of ['Ping-Pong!', 'pingpong', 'table tennis', 'Tafeltennis']) assert.equal(key(n), 'tabletennis', n);
  assert.equal(key('American football'), 'americanfootball', 'not the same as football');
  assert.equal(key('zaalvoetbal'), 'futsal');
  assert.equal(key('Pétanque'), 'petanque');
  assert.equal(key('jeu de boules'), 'petanque');
  assert.equal(key('football UK'), 'football', 'extra words left out');
  assert.equal(key('the sport of korfball'), 'korfball');
});

test('typos: a few letters off still count for the sport', () => {
  for (const [typed, k] of [['socer', 'football'], ['footbal', 'football'], ['voleyball', 'volleyball'], ['badmington', 'badminton'],
    ['basebal', 'baseball'], ['hanbdall', 'handball'], ['korfbll', 'korfball'], ['tafletennis', 'tabletennis']]) {
    assert.equal(key(typed), k, typed);
  }
  assert.equal(distance('ab', 'ba'), 1, 'two letters swapped is one typo');
});

test('short names must be exact; different sports never merge', () => {
  assert.equal(key('golf'), 'golf');
  assert.equal(key('gulf'), 'x-gulf', 'four letters: no typos allowed');
  assert.equal(key('netball'), 'netball');
  assert.notEqual(key('netbal'), 'football');
});

test('a new sport gets its own place, and its typos join it', () => {
  assert.deepEqual(match('Shinty'), { key: 'x-shinty', known: false });
  const others = new Map([['shinty', 'x-shinty']]);
  assert.equal(key('shintty', others), 'x-shinty');
  assert.equal(key('Shinty!', others), 'x-shinty');
  assert.equal(key('hurling'), 'hurling', 'not curling: one letter apart, but the first');
});

test('only short plain names are taken', () => {
  for (const ok of ['Korfball', 'beach tennis', 'Sepak takraw', '3x3 basketball']) assert.equal(valid(ok), true, ok);
  for (const bad of ['', 'a', 'x'.repeat(41), 'http://spam.ru', 'www.casino', 'buy at shop.com', 'me@mail.be', '<script>', '!!!', '12345',
    'one two three four five six']) assert.equal(valid(bad), false, bad);
  assert.equal(clean('  Beach—Volley!! '), 'beach volley');
});

test('the place a time zone stands for, never more precise', () => {
  assert.deepEqual(place('Europe/Brussels'), { tz: 'Europe/Brussels', country: 'BE', lat: 50.83, lng: 4.33 });
  assert.equal(place('Asia/Calcutta').tz, 'Asia/Kolkata');
  assert.deepEqual(place('Mars/Olympus'), {});
});

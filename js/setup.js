// "New match" pop-up: team names, which side of the screen each team is on, and who serves first
// (picked with a tap, or drawn at random with a secure coin flip).
import { secureCoinFlip } from './random.js';

export function createMatchSetup({ dialog, onStart, onDraw }) {
  const $ = (id) => dialog.querySelector(`#${id}`);
  const court = $('setupCourt');
  const shuttle = $('setupShuttle');
  const teams = [...dialog.querySelectorAll('.setup-team')];
  let server = 0;
  let swapped = false;
  let drawing = false;

  const name = (t) => $(`setupName${t}`).value.trim() || (t === 0 ? 'Home' : 'Away');

  // Move the shuttle to the serving team's box.
  function placeShuttle() {
    const box = teams[server].getBoundingClientRect();
    const area = court.getBoundingClientRect();
    shuttle.style.transform = `translate(${box.right - area.left - 40}px, ${box.top - area.top + 12}px)`;
    shuttle.classList.toggle('on-light', server === 1);
    for (const t of teams) t.classList.toggle('serving', Number(t.dataset.team) === server);
    $('setupServeText').textContent = `${name(server)} serves first`;
  }

  function setServer(team) {
    if (drawing) return;
    server = team;
    placeShuttle();
  }

  function setSwapped(value) {
    const apply = () => {
      swapped = value;
      court.classList.toggle('swapped', swapped);
      placeShuttle();
    };
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(apply).finished.then(placeShuttle, placeShuttle);
    } else {
      apply();
    }
  }

  // Draw first, then animate: the shuttle bounces between the sides, slowing down, and stops on
  // the side that was drawn. The animation only shows the result; it doesn't decide it.
  async function draw() {
    if (drawing) return;
    const result = secureCoinFlip();
    drawing = true;
    dialog.classList.add('drawing');
    const hops = 8 + (server === result ? 0 : 1); // an even number of hops returns to the start
    for (let i = 0; i < hops; i++) {
      server = 1 - server;
      placeShuttle();
      await new Promise((r) => setTimeout(r, 90 + i * 30));
    }
    drawing = false;
    dialog.classList.remove('drawing');
    onDraw?.(name(server));
  }

  function start() {
    if (drawing) return;
    dialog.close();
    onStart({ names: [name(0), name(1)], swapped, firstServer: server });
  }

  for (const t of teams) {
    t.addEventListener('click', (e) => {
      if (e.target.closest('.setup-name-row')) return; // editing a name doesn't pick the server
      setServer(Number(t.dataset.team));
    });
  }
  $('setupSwap').addEventListener('click', () => setSwapped(!swapped));
  $('setupRandom').addEventListener('click', draw);
  $('setupStart').addEventListener('click', start);
  $('setupCancel').addEventListener('click', () => dialog.close());
  for (const t of [0, 1]) $(`setupName${t}`).addEventListener('input', placeShuttle);
  // Follow the court when it changes size or shape (rotation, a name wrapping to two lines).
  new ResizeObserver(() => { if (dialog.open) placeShuttle(); }).observe(court);

  return {
    get open() {
      return dialog.open;
    },
    show({ names, swapped: sides, firstServer }) {
      $('setupName0').value = names[0];
      $('setupName1').value = names[1];
      server = firstServer;
      swapped = sides;
      court.classList.toggle('swapped', swapped);
      dialog.showModal();
      requestAnimationFrame(placeShuttle);
    },
    // The remote works in the pop-up too: 1 click switches the server, 2 clicks draws at random,
    // a long press starts the match.
    gesture(g) {
      if (g === 'single') setServer(1 - server);
      else if (g === 'double') draw();
      else if (g === 'long') start();
    },
  };
}

/* games-data.js — central axcStudios game catalog (shared by index and store) */
window.AXC_GAMES = [
  { id: 'warzone-ocean-siege', title: 'The Warzone: Ocean Siege', genre: 'FPS · Battle Royale', cat: 'axc', img: 'images/games/warzone-ocean-siege.jpg', desc: 'Tactical battle royale at sea: deploy, loot, outlast the closing circle and be the last squad standing.', url: 'https://axcgamestudios.github.io/cod1/', star: true },
  { id: 'rocket-ball', title: 'Rocket Ball', genre: 'Sports · Action', cat: 'arcade', img: 'images/games/rocket-ball.jpg', desc: 'Rocket-powered car soccer: take flight, boost and score impossible goals.', url: 'https://axcgamestudios.github.io/ra1/' },
  { id: 'lost-pizzeria-nw', title: 'The Lost Pizzeria: New World', genre: 'Horror · Adventure', cat: 'fnaf', img: 'images/games/lost-pizzeria-nw.jpg', desc: 'A brand-new world in ruins where animatronic titans rule the city.', url: 'https://axcgamestudios.github.io/FNAW/' },
  { id: 'lost-pizzeria-mp', title: 'The Lost Pizzeria: Multiplayer', genre: 'Horror · Online', cat: 'fnaf', img: 'images/games/lost-pizzeria-mp.png', desc: 'Shared horror: run or hunt alongside other players in real time.', url: 'https://axcgamestudios2.github.io/fnafm/' },
  { id: 'kfs', title: 'Kingdom of the Forgotten Seas', genre: 'Adventure · Open World', cat: 'axc', img: 'images/games/kingdom-forgotten-seas.jpg', desc: 'Sail a ship across a medieval archipelago: naval battles, sunken treasure, castles and crew to recruit.', url: 'https://axcgamestudios.github.io/KFS/', star: true },
  { id: 'velocitygp', title: 'VelocityGP', genre: 'Racing · Arcade', cat: 'axc', img: 'images/games/velocitygp.jpg', desc: 'Arcade racing evolved: full-throttle laps at the Mexico City Grand Prix from the cockpit.', url: 'https://axcgamestudios.github.io/googleslides/' },
  { id: 'emergency-strike', title: 'Emergency Strike', genre: 'FPS · Tactical', cat: 'axc', img: 'images/games/emergency-strike.jpg', desc: 'Tactical FPS: elite operations in urban combat zones, enemy waves and missions under pressure.', url: 'https://axcgamestudios.github.io/Googlecom/' },
  { id: 'apex-kart', title: 'Apex Kart', genre: 'Karts · Arcade', cat: 'axc', img: 'images/games/apex-kart.jpg', desc: 'High-velocity arcade karts: drift to charge turbo, explosive items, shortcuts and chaos until the final lap.', url: 'https://axcgamestudios.github.io/gmail/' },
  { id: 'zona-cero', title: 'Zona Cero', genre: 'Battle Royale', cat: 'axc', img: 'images/games/zona-cero.png', desc: 'The zone is closing: gather resources, craft upgrades and be the last one standing.', url: 'https://nflowstudios.github.io/Googlemeet/' },
  { id: 'gtv', title: 'Grand Theft Voxel', genre: 'Open World · Voxel', cat: 'axc', img: 'images/games/grand-theft-voxel.png', desc: 'GTA in a voxel world: steal cars, outrun the police with wanted stars and tear a destructible city apart.', url: 'https://axcgamestudios.github.io/GTV/' }
];

/* Renders the catalog into a container. opts: {filter, onPlay, locked(g)->bool, query} */
window.axcRenderGames = function (gridEl, opts) {
  opts = opts || {};
  const f = opts.filter || 'all';
  const q = (opts.query || '').toLowerCase();
  const list = window.AXC_GAMES.filter(g =>
    (f === 'all' || g.cat === f) &&
    (!q || g.title.toLowerCase().includes(q) || g.genre.toLowerCase().includes(q))
  );
  if (!list.length) {
    gridEl.innerHTML = '<div class="store-empty">No results… try another search 🎮</div>';
    return;
  }
  gridEl.innerHTML = list.map((g, i) => `
    <article class="game-card" data-cat="${g.cat}" style="animation:axc-in .6s cubic-bezier(.16,1,.3,1) ${Math.min(i * 0.04, 0.5)}s backwards">
      <div class="game-cover">
        ${g.star ? `<span class="badge">★ axc Badge</span>` : ''}
        <img src="${g.img}" alt="${g.title} cover" loading="lazy" width="675" height="900">
      </div>
      <div class="game-body">
        <div class="game-genre">${g.genre}</div>
        <div class="game-title">${g.title}</div>
        <p class="game-desc">${g.desc}</p>
        <div class="game-actions">
          <button class="btn-play" data-play="${g.id}" title="Play ${g.title}">
            <svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg> Play
          </button>
          <span class="free-tag">FREE</span>
        </div>
      </div>
    </article>`).join('');
  gridEl.querySelectorAll('[data-play]').forEach(b => {
    b.addEventListener('click', () => {
      const g = window.AXC_GAMES.find(x => x.id === b.dataset.play);
      /* also pass the card: the FLIP animation flies from there */
      if (g && opts.onPlay) opts.onPlay(g, b.closest('.game-card') || b);
    });
  });
};

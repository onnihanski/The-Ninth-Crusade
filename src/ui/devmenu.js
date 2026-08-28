import { ITEMS, itemCategory } from '../data/items.js';
import { MONSTERS } from '../data/monsters.js';
import { REGIONS, MAX_DEPTH } from '../data/regions.js';
import { GATE_CHAPTERS, BOSS_LORE } from '../data/lore.js';
import { makeItem, makeMonster, makeRevenant } from '../game/entity.js';
import { gainXp, xpToNext, regenInterval } from '../game/progress.js';
import { mergeDuplicates } from '../game/actions.js';
import { damage } from '../game/combat.js';
import {
  effectivePower, effectiveDefense, effectiveSpeed, rangedProfile,
  traitsOf, sanctuaryBonus, canBlock, mergeBonus,
} from '../game/status.js';
import { heirloomBonus } from '../data/traits.js';

// ---------------------------------------------------------------------------
// Dev menu.
//
// Every system in this game is several floors deep behind a random dungeon,
// which makes checking any one of them by playing to it impractical. This puts
// each of them one click away, and prints the derived numbers beside the base
// ones so a formula can be read rather than inferred.
//
// Opened with 0 or F1. Deliberately not discoverable by accident, and equally
// deliberately always available -- it is as useful for looking at a live bug as
// it is for looking at a feature.
// ---------------------------------------------------------------------------
export class DevMenu {
  constructor(root, hooks) {
    this.hooks = hooks;
    this.el = root.getElementById('dev');
    this.body = root.getElementById('dev-body');
    this.readout = root.getElementById('dev-readout');
    if (!this.el) return;

    root.getElementById('dev-close').addEventListener('click', () => this.close());
    this.build();
    this.el.hidden = true;
  }

  get game() {
    return this.hooks.getGame();
  }

  /** Run a mutation and put the world back on screen. */
  act(fn) {
    fn(this.game);
    this.hooks.redraw();
    this.refresh();
  }

  toggle() {
    if (this.el.hidden) this.open();
    else this.close();
  }

  open() {
    this.el.hidden = false;
    this.refresh();
  }

  close() {
    this.el.hidden = true;
  }

  get isOpen() {
    return !this.el.hidden;
  }

  // -- construction ---------------------------------------------------------

  build() {
    this.body.replaceChildren(
      this.depthSection(),
      this.characterSection(),
      this.gearSection(),
      this.spawnSection(),
      this.storySection(),
      this.memorialSection(),
      this.worldSection(),
    );
  }

  section(title, ...children) {
    const wrap = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = title;
    wrap.append(heading, ...children);
    return wrap;
  }

  row(...children) {
    const div = document.createElement('div');
    div.className = 'dev-row';
    div.append(...children);
    return div;
  }

  button(label, onClick, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }

  select(groups) {
    const s = document.createElement('select');
    for (const [label, options] of groups) {
      const group = document.createElement('optgroup');
      group.label = label;
      for (const [value, text] of options) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        group.append(option);
      }
      s.append(group);
    }
    return s;
  }

  // -- sections -------------------------------------------------------------

  depthSection() {
    const depths = this.row(...Array.from({ length: MAX_DEPTH }, (_, i) => {
      const depth = i + 1;
      const region = REGIONS.find((r) => depth >= r.depths[0] && depth <= r.depths[1]);
      const boss = depth === region.depths[1];
      return this.button(String(depth), () => this.act((g) => {
        g.buildLevel(depth);
        g.player.hp = g.player.maxHp;
      }), region.name + (boss ? ' — boss floor' : ''));
    }));

    const shortcuts = this.row(
      ...REGIONS.map((region) => this.button(region.name.replace('The ', ''),
        () => this.act((g) => {
          g.buildLevel(region.depths[0]);
          g.player.hp = g.player.maxHp;
        }), 'first floor of ' + region.name)),
      this.button('reroll floor', () => this.act((g) => g.buildLevel(g.level.depth))),
    );

    return this.section('Depth — each number is a floor, the last of each region is its boss',
      depths, shortcuts);
  }

  characterSection() {
    return this.section('Character',
      this.row(
        this.button('+1 level', () => this.act((g) => gainXp(g, g.player, xpToNext(g.player.level)))),
        this.button('+5 levels', () => this.act((g) => {
          for (let i = 0; i < 5; i++) gainXp(g, g.player, xpToNext(g.player.level));
        })),
        this.button('heal', () => this.act((g) => { g.player.hp = g.player.maxHp; })),
        this.button('hurt to 25%', () => this.act((g) => {
          g.player.hp = Math.max(1, Math.round(g.player.maxHp * 0.25));
        })),
      ),
      this.row(
        this.button('invincible', () => this.act((g) => {
          g.player.maxHp = 9999;
          g.player.hp = 9999;
          g.player.defense = 99;
        }), 'survive anything, to inspect a fight at leisure'),
        this.button('glass cannon', () => this.act((g) => { g.player.power = 500; }),
          'one-shot anything, to reach a later floor quickly'),
        this.button('reset stats', () => this.act((g) => {
          g.player.power = 5;
          g.player.defense = 1;
          g.player.maxHp = 26 + (g.player.level - 1) * 4;
          g.player.hp = g.player.maxHp;
        })),
      ),
    );
  }

  gearSection() {
    const gear = Object.entries(ITEMS);
    const byCategory = new Map();
    for (const [key, spec] of gear) {
      const category = itemCategory(spec);
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push([key, spec.name
        + (spec.rarity ? ' (' + spec.rarity + ')' : '')
        + (spec.trait ? ' — ' + spec.trait : '')]);
    }
    const picker = this.select([...byCategory.entries()]);

    return this.section('Gear',
      this.row(
        picker,
        this.button('give', () => this.act((g) => {
          g.player.inventory.push(makeItem({ key: picker.value, ...ITEMS[picker.value] }, 0, 0));
          g.log('[dev] ' + ITEMS[picker.value].name + ' added to the pack.', 'textDim');
        })),
        this.button('give ×2 (mergeable)', () => this.act((g) => {
          for (let i = 0; i < 2; i++) {
            g.player.inventory.push(makeItem({ key: picker.value, ...ITEMS[picker.value] }, 0, 0));
          }
        })),
        this.button('give as heirloom', () => this.act((g) => {
          const item = makeItem({ key: picker.value, ...ITEMS[picker.value] }, 0, 0);
          item.item.heirloom = { of: 'Pilgrim Test the Deceased', deepest: 12, marks: 3 };
          g.player.inventory.push(item);
        }), 'a piece taken off a predecessor who died at the bottom'),
      ),
      this.row(
        this.button('all sacred gear', () => this.act((g) => {
          for (const [key, spec] of gear) {
            if (spec.rarity === 'sacred') {
              g.player.inventory.push(makeItem({ key, ...spec }, 0, 0));
            }
          }
        }), 'the trait-carrying pieces: cleave, reach, pierce, block, riposte, sanctuary'),
        this.button('every relic', () => this.act((g) => {
          for (const [key, spec] of gear) {
            if (spec.use) g.player.inventory.push(makeItem({ key, ...spec }, 0, 0));
          }
        })),
        this.button('merge a pair', () => this.act((g) => mergeDuplicates(g, g.player))),
        this.button('empty pack', () => this.act((g) => { g.player.inventory.length = 0; })),
      ),
    );
  }

  spawnSection() {
    const monsters = Object.entries(MONSTERS);
    const picker = this.select([
      ['rank and file', monsters.filter(([, m]) => !m.boss)
        .map(([key, m]) => [key, m.name + (m.ranged ? ' (ranged)' : '')])],
      ['bosses', monsters.filter(([, m]) => m.boss)
        .map(([key, m]) => [key, m.name + ' — ' + m.bossTrait])],
    ]);

    const placeNear = (g, make) => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2], [-2, 0], [0, -2]]) {
        const x = g.player.x + dx;
        const y = g.player.y + dy;
        if (g.level.isOpen(x, y)) {
          g.level.add(make(x, y));
          return true;
        }
      }
      g.log('[dev] nowhere beside you to put it.', 'textDim');
      return false;
    };

    return this.section('Spawn — placed beside you',
      this.row(
        picker,
        this.button('spawn', () => this.act((g) => placeNear(g, (x, y) => {
          const spec = { key: picker.value, ...MONSTERS[picker.value] };
          const monster = makeMonster(spec, x, y);
          monster.ai.hunting = true;
          return monster;
        }))),
        this.button('spawn ×4', () => this.act((g) => {
          for (let i = 0; i < 4; i++) {
            placeNear(g, (x, y) => {
              const m = makeMonster({ key: picker.value, ...MONSTERS[picker.value] }, x, y);
              m.ai.hunting = true;
              return m;
            });
          }
        }), 'for checking cleave, or a piercing bolt down a line'),
      ),
      this.row(
        this.button('spawn a revenant', () => this.act((g) => placeNear(g, (x, y) => {
          const revenant = makeRevenant({
            name: 'Pilgrim Test the Deceased',
            depth: g.level.depth, level: 8, power: 9, defense: 4, maxHp: 40,
            relics: ['reliquaryPhial'],
            equipment: [{ key: 'martyrsGreatsword', heirloom: null }],
          }, x, y);
          revenant.ai.hunting = true;
          return revenant;
        })), 'carries gear it gains nothing from, and drops all of it'),
        this.button('kill everything', () => this.act((g) => {
          for (const e of [...g.level.entities]) {
            if (e.ai && e.alive) damage(g, e, 99999, g.player);
          }
        })),
      ),
    );
  }

  storySection() {
    return this.section('Story — panels, in order',
      this.row(...REGIONS.filter((r) => GATE_CHAPTERS[r.key]).map((region) =>
        this.button(GATE_CHAPTERS[region.key].title, () => this.act((g) => {
          const chapter = GATE_CHAPTERS[region.key];
          g.tellStory({ kind: 'chapter', title: chapter.title, lines: chapter.lines });
        })))),
      this.row(...REGIONS.map((region) => {
        const lore = BOSS_LORE[region.boss];
        return this.button(lore.title.replace(/^the /, ''), () => this.act((g) => {
          g.tellStory({
            kind: 'boss', title: lore.title, lines: lore.lines, mechanic: lore.mechanic,
          });
        }), region.final ? 'the reveal' : 'boss lore');
      })),
    );
  }

  memorialSection() {
    return this.section('Memorial',
      this.row(
        this.button('add a predecessor here', () => this.act((g) => {
          g.memorial.record({
            name: 'Pilgrim Test ' + (g.memorial.entries.length + 1),
            depth: g.level.depth, region: g.region.name, killedBy: 'the dev menu',
            level: 6, power: 8, defense: 3, maxHp: 38, turn: 1, at: Date.now(),
            relics: ['reliquaryPhial'],
            equipment: [{ key: 'mailHauberk', heirloom: null }],
          });
          g.log('[dev] recorded. Reroll this floor to meet them.', 'textDim');
        }), 'then reroll the floor — nobody returns above depth 3'),
        this.button('clear memorial', () => this.act((g) => {
          g.memorial.clear();
          g.log('[dev] memorial cleared.', 'textDim');
        })),
        this.button('new crusade', () => { this.hooks.newGame(); this.refresh(); }),
      ),
    );
  }

  worldSection() {
    return this.section('World',
      this.row(
        this.button('reveal map', () => this.act((g) => {
          g.level.explored.fill(true);
        })),
        this.button('open the arena door', () => this.act((g) => {
          if (!g.level.door) {
            g.log('[dev] this floor has no arena.', 'textDim');
            return;
          }
          g.unlockArena();
        })),
        this.button('stand at the arena door', () => this.act((g) => {
          const door = g.level.door;
          if (!door) {
            g.log('[dev] this floor has no arena.', 'textDim');
            return;
          }
          const spot = [[0, -1], [1, 0], [0, 1], [-1, 0]]
            .map(([dx, dy]) => ({ x: door.x + dx, y: door.y + dy }))
            .find((p) => !g.level.inArena(p.x, p.y) && g.level.isWalkable(p.x, p.y));
          if (spot) {
            g.player.x = spot.x;
            g.player.y = spot.y;
            g.level.updateFov(g.player, g.theme.fovRadius);
          }
        })),
        this.button('unseal the gate', () => this.act((g) => {
          if (!g.level.sealed) {
            g.log('[dev] nothing sealed here.', 'textDim');
            return;
          }
          g.level.sealed = false;
          g.log('[dev] gate unsealed.', 'textDim');
        })),
      ),
    );
  }

  // -- live readout ---------------------------------------------------------

  /**
   * Base and derived side by side. Most of this game's numbers are computed
   * from four or five sources at once, and the only honest way to check one is
   * to see the parts next to the total.
   */
  refresh() {
    if (!this.readout || this.el.hidden) return;
    const g = this.game;
    const p = g.player;
    const ranged = rangedProfile(p);
    const worn = Object.entries(p.equipment ?? {})
      .filter(([, item]) => item)
      .map(([slot, item]) => slot + ': ' + item.name
        + (heirloomBonus(item.item.heirloom) ? ' +' + heirloomBonus(item.item.heirloom) : ''));

    const lines = [
      ['crusader', g.crusaderName + '   level ' + p.level
        + '   xp ' + p.xp + '/' + xpToNext(p.level)],
      ['hp', p.hp + ' / ' + p.maxHp + '   regen every ' + regenInterval(p) + ' turns'],
      ['power', p.power + ' base  →  ' + effectivePower(p) + ' effective'
        + '   (merges +' + mergeBonus(p, 'power') + ')'],
      ['defense', p.defense + ' base  →  ' + effectiveDefense(p) + ' effective'
        + '   (sanctuary +' + sanctuaryBonus(p) + ', merges +' + mergeBonus(p, 'defense') + ')'],
      ['speed', p.speed + ' base  →  ' + effectiveSpeed(p) + ' effective'],
      ['ranged', ranged ? ranged.power + ' dmg / ' + ranged.range + ' tiles / reload '
        + ranged.reload + (p.reloadLeft ? '  (reloading ' + p.reloadLeft + ')' : '  (loaded)')
        : 'nothing that shoots'],
      ['traits', traitsOf(p).join(', ') || 'none'
        + (canBlock(p) ? '' : '')],
      ['merges', (p.merges ?? []).map((m) => m.boon.stat + ' +' + m.boon.amount).join(', ') || 'none'],
      ['worn', worn.join('   ') || 'nothing'],
      ['pack', p.inventory.map((i) => i.name).join(', ') || 'empty'],
      ['seals', g.seals().map((s) => s.name).join(', ') || 'none'],
      ['floor', g.region.name + '   depth ' + g.level.depth
        + (g.level.sealed ? '   [gate sealed]' : '')
        + (g.level.bossRoom ? (g.level.doorLocked ? '   [door barred]' : '   [arena, door open]') : '')],
      ['alive here', g.level.entities.filter((e) => e.ai && e.alive).length
        + ' monsters, ' + g.level.entities.filter((e) => e.item).length + ' items on the floor'],
      ['memorial', g.memorial.entries.length + ' recorded  ·  crusade #'
        + g.memorial.runNumber()],
    ];

    this.readout.replaceChildren(...lines.map(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'dev-stat';
      const key = document.createElement('span');
      key.textContent = label;
      const val = document.createElement('b');
      val.textContent = value;
      row.append(key, val);
      return row;
    }));
  }
}

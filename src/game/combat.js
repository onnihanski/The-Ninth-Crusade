// Deliberately simple: power vs defense with a small random spread. This is the
// first thing worth replacing once the game has a theme -- to-hit rolls,
// damage types, resistances, criticals all slot in here.
export function attack(game, attacker, defender) {
  const roll = game.rng.int(attacker.power - 1, attacker.power + 1);
  const dealt = Math.max(0, roll - defender.defense);
  const subject = attacker.isPlayer ? 'You' : capitalize('the ' + attacker.name);
  const object = defender.isPlayer ? 'you' : 'the ' + defender.name;
  const verb = attacker.isPlayer ? 'hit' : 'hits';

  if (dealt <= 0) {
    game.log(subject + ' ' + verb + ' ' + object + ', but it glances off.', 'textDim');
    return;
  }

  game.log(
    subject + ' ' + verb + ' ' + object + ' for ' + dealt + ' damage.',
    attacker.isPlayer ? 'text' : 'bad',
  );
  damage(game, defender, dealt);
}

export function damage(game, target, amount) {
  target.hp -= amount;
  if (target.hp > 0) return;

  if (target.isPlayer) {
    target.alive = false;
    game.state = 'dead';
    game.log(game.theme.strings.death, 'bad');
  } else {
    game.log('The ' + target.name + ' dies.', 'good');
    target.alive = false;
    target.blocks = false;
    target.speed = 0;
    target.ai = null;
    target.glyph = '%';
    target.color = 'corpse';
    target.name = target.name + ' corpse';
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

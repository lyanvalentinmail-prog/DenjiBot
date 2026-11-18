/**
 * Calculadora científica segura con analizador sintáctico propio (sin eval).
 */

const CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2
};

const FUNCS = {
  sqrt: x => {
    if (x < 0) throw new Error('Raíz cuadrada de número negativo');
    return Math.sqrt(x);
  },
  raiz: x => {
    if (x < 0) throw new Error('Raíz cuadrada de número negativo');
    return Math.sqrt(x);
  },
  cbrt: Math.cbrt,
  abs: Math.abs,
  sin: Math.sin,
  sen: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round
};

function tokenize(expr) {
  const s = String(expr)
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/,/g, '.');

  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      let dots = 0;
      while (i < s.length && /[0-9.]/.test(s[i])) {
        if (s[i] === '.' && ++dots > 1) throw new Error('Número decimal no válido');
        num += s[i++];
      }
      const val = Number(num);
      if (!Number.isFinite(val)) throw new Error('Número no válido');
      tokens.push({ type: 'num', value: val });
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let id = '';
      while (i < s.length && /[a-zA-Z0-9]/.test(s[i])) id += s[i++];
      tokens.push({ type: 'id', value: id.toLowerCase() });
      continue;
    }
    if ('+-*/^%()!'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    throw new Error(`Símbolo no reconocido: "${ch}"`);
  }
  return tokens;
}

function factorial(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error('El factorial requiere un entero >= 0');
  if (n > 170) throw new Error('Número demasiado grande para factorial');
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function evaluateExpression(raw) {
  const tokens = tokenize(raw);
  if (!tokens.length) throw new Error('Expresión vacía');
  if (tokens.length > 150) throw new Error('Expresión demasiado larga');

  let pos = 0;
  let depth = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseAdd() {
    let left = parseMul();
    while (peek()?.type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const right = parseMul();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseMul() {
    let left = parsePow();
    while (true) {
      const t = peek();
      if (t?.type === 'op' && (t.value === '*' || t.value === '/' || t.value === '%')) {
        consume();
        const right = parsePow();
        if ((t.value === '/' || t.value === '%') && right === 0) {
          throw new Error('No se puede dividir entre cero');
        }
        left = t.value === '*' ? left * right : t.value === '/' ? left / right : left % right;
      } else if (t && (t.type === 'id' || (t.type === 'op' && t.value === '('))) {
        // Multiplicación implícita: 2pi, 3(4+5), 2sqrt(9)
        left *= parsePow();
      } else {
        break;
      }
    }
    return left;
  }

  function parsePow() {
    const base = parseUnary();
    if (peek()?.type === 'op' && peek().value === '^') {
      consume();
      const exp = parsePow();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary() {
    if (peek()?.type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const val = parseUnary();
      return op === '-' ? -val : val;
    }
    return parsePostfix();
  }

  function parsePostfix() {
    let val = parsePrimary();
    while (peek()?.type === 'op' && peek().value === '!') {
      consume();
      val = factorial(val);
    }
    return val;
  }

  function parsePrimary() {
    if (++depth > 40) throw new Error('Demasiados paréntesis anidados');
    try {
      const t = peek();
      if (!t) throw new Error('Expresión incompleta');

      if (t.type === 'num') {
        consume();
        return t.value;
      }

      if (t.type === 'id') {
        consume();
        if (Object.hasOwn(CONSTANTS, t.value)) return CONSTANTS[t.value];
        const fn = FUNCS[t.value];
        if (!fn) throw new Error(`Función desconocida: "${t.value}"`);
        let arg;
        if (peek()?.type === 'op' && peek().value === '(') {
          consume();
          arg = parseAdd();
          if (peek()?.type !== 'op' || peek().value !== ')') {
            throw new Error('Falta cerrar paréntesis ")"');
          }
          consume();
        } else {
          arg = parseUnary();
        }
        return fn(arg);
      }

      if (t.type === 'op' && t.value === '(') {
        consume();
        const val = parseAdd();
        if (peek()?.type !== 'op' || peek().value !== ')') {
          throw new Error('Falta cerrar paréntesis ")"');
        }
        consume();
        return val;
      }

      throw new Error(`Expresión no válida cerca de "${t.value}"`);
    } finally {
      depth--;
    }
  }

  const result = parseAdd();
  if (pos < tokens.length) {
    throw new Error(`Símbolo inesperado: "${tokens[pos].value}"`);
  }
  if (!Number.isFinite(result)) {
    throw new Error('El resultado está fuera de rango');
  }
  return Object.is(result, -0) ? 0 : Number(result.toPrecision(12));
}

export default {
  command: ['calc', 'calcular', 'calculadora'],
  category: 'utils',
  description: 'Resolver operaciones matemáticas y científicas.',
  run: async ({ msg, args, usedPrefix, command }) => {
    const expr = args.join(' ').trim();
    if (!expr) {
      return msg.reply(
        `《✧》 Escribe una operación matemática.\n` +
        `> Ejemplos: *${usedPrefix + command} (25 * 4) + sqrt(144)* · *${usedPrefix + command} 2^10* · *${usedPrefix + command} sin(pi/2)*`
      );
    }

    try {
      const result = evaluateExpression(expr);
      await msg.reply(
        `✿ *Calculadora*\n\n` +
        `│✎ *Expresión ::* \`${expr}\`\n` +
        `│✦ *Resultado ::* *${result}*`
      );
    } catch (e) {
      await msg.reply(`《✧》 No se pudo calcular: *${e.message}*.`);
    }
  }
};

// 式の読みとり：「4*mod(k,2)/(k*pi)」のような k の式を計算する。
// eval は使わず、書ける形（数・k・n・pi・e・四則演算・^・いくつかの関数）だけを自分で読みとる。
const Expr = (() => {
  const FUNCS = {
    sin: [1, Math.sin], cos: [1, Math.cos], tan: [1, Math.tan],
    asin: [1, Math.asin], acos: [1, Math.acos], atan: [1, Math.atan],
    sinh: [1, Math.sinh], cosh: [1, Math.cosh], tanh: [1, Math.tanh],
    sqrt: [1, Math.sqrt], abs: [1, Math.abs], exp: [1, Math.exp],
    ln: [1, Math.log], log: [1, Math.log10],
    floor: [1, Math.floor], ceil: [1, Math.ceil], round: [1, Math.round], sign: [1, Math.sign],
    mod: [2, (a, b) => ((a % b) + b) % b], // 割った余り（いつも 0 以上）
    min: [2, Math.min], max: [2, Math.max],
    eq: [2, (a, b) => (Math.abs(a - b) < 1e-9 ? 1 : 0)], // a と b が等しければ 1、ちがえば 0
  };
  const CONSTS = { pi: Math.PI, e: Math.E };
  const VARS = ["k", "n"];

  class ExprError extends Error {}

  // 全角の数字や記号を半角にそろえる
  function normalize(src) {
    return String(src)
      .normalize("NFKC")
      .replace(/[×・]/g, "*")
      .replace(/÷/g, "/")
      .replace(/[−ー―]/g, "-")
      .replace(/\*\*/g, "^")
      .replace(/π/g, "pi");
  }

  function tokenize(s) {
    const tokens = [];
    const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(.))/gy;
    let m;
    while (re.lastIndex < s.length && (m = re.exec(s))) {
      if (m[1] !== undefined) tokens.push({ t: "num", v: parseFloat(m[1]) });
      else if (m[2] !== undefined) tokens.push({ t: "id", v: m[2] });
      else if (m[3] !== undefined && /\S/.test(m[3])) tokens.push({ t: "op", v: m[3] });
    }
    return tokens;
  }

  function parse(src) {
    const tokens = tokenize(normalize(src));
    if (!tokens.length) throw new ExprError("式が空です。");
    let i = 0;
    const peek = () => tokens[i];
    const isOp = (v) => peek() && peek().t === "op" && peek().v === v;
    const show = (tk) => (tk ? `「${tk.v}」` : "式の終わり");

    function expr() {
      let left = term();
      while (isOp("+") || isOp("-")) {
        const op = tokens[i++].v;
        const right = term();
        const l = left;
        left = op === "+" ? (env) => l(env) + right(env) : (env) => l(env) - right(env);
      }
      return left;
    }

    function term() {
      let left = unary();
      while (isOp("*") || isOp("/")) {
        const op = tokens[i++].v;
        const right = unary();
        const l = left;
        left = op === "*" ? (env) => l(env) * right(env) : (env) => l(env) / right(env);
      }
      // 2k や 2(k+1) のような「かけ算の記号を省いた書き方」は、1/2k が 1/(2k) か (1/2)k か決まらないので使わない
      const nx = peek();
      if (nx && (nx.t === "num" || nx.t === "id" || (nx.t === "op" && nx.v === "("))) {
        throw new ExprError(`${show(nx)}の前に「*」がありません。かけ算は 2*k のように「*」を書いてください。`);
      }
      return left;
    }

    // マイナスは ^ より弱い（-1^k は -(1^k)）。(-1)^k と書けば -1 の k 乗
    function unary() {
      if (isOp("-")) { i++; const x = unary(); return (env) => -x(env); }
      if (isOp("+")) { i++; return unary(); }
      return power();
    }

    function power() {
      const base = primary();
      if (isOp("^")) {
        i++;
        const exp = unary(); // 右から計算（2^3^2 は 2^(3^2)）。2^-1 も書ける
        return (env) => Math.pow(base(env), exp(env));
      }
      return base;
    }

    function primary() {
      const tk = tokens[i++];
      if (!tk) throw new ExprError("式が途中で終わっています。");
      if (tk.t === "num") return () => tk.v;
      if (tk.t === "op" && tk.v === "(") {
        const inner = expr();
        if (!isOp(")")) throw new ExprError("「(」に対応する「)」がありません。");
        i++;
        return inner;
      }
      if (tk.t === "id") {
        const name = tk.v;
        const lower = name.toLowerCase();
        if (isOp("(")) {
          const f = FUNCS[lower];
          if (!f) throw new ExprError(`「${name}」という関数はありません。`);
          i++;
          const args = [];
          if (!isOp(")")) {
            args.push(expr());
            while (isOp(",")) { i++; args.push(expr()); }
          }
          if (!isOp(")")) throw new ExprError(`${name}( の「)」がありません。`);
          i++;
          if (args.length !== f[0]) throw new ExprError(`${name} には ${f[0]} 個の値が必要です（${name}(${f[0] === 1 ? "x" : "a, b"}) の形）。`);
          return (env) => f[1](...args.map((a) => a(env)));
        }
        if (VARS.includes(lower)) return (env) => env[lower];
        if (lower in CONSTS) return () => CONSTS[lower];
        if (FUNCS[lower]) throw new ExprError(`「${name}」は関数なので、${name}(k) のようにカッコを付けてください。`);
        throw new ExprError(`「${name}」は使えません。使えるのは k, n, pi, e と関数だけです。`);
      }
      throw new ExprError(`${show(tk)} は使えません。`);
    }

    const f = expr();
    if (i < tokens.length) {
      const tk = tokens[i];
      if (tk.t === "op" && tk.v === ")") throw new ExprError("「)」に対応する「(」がありません。");
      throw new ExprError(`${show(tk)} のところで式が読みとれません。`);
    }
    return f;
  }

  // 式を読みとって、{k, n} の値から数を返す関数にする
  function compile(src) {
    const f = parse(src);
    return (vars) => f(vars);
  }

  return { compile, ExprError };
})();

if (typeof module !== "undefined") module.exports = Expr;

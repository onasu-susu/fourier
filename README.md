# フーリエ級数で音をつくる

フーリエ級数

    f(x) = a0/2 + Σ(k=1..n) { a_k cos(kπx/L) + b_k sin(kπx/L) }

の a0・a_k（k の式）・b_k（k の式）・L・n を入力して、波形を見ながらその音を聴けるウェブアプリです。

遊ぶ: https://onasu-susu.github.io/fourier/

- `index.html` … 画面
- `style.css` … 見た目
- `expr.js` … `4*mod(k,2)/(k*pi)` のような k の式を読みとる（eval は使いません）
- `app.js` … 波形・倍音のグラフ、Web Audio の PeriodicWave による再生

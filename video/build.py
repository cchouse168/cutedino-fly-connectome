# -*- coding: utf-8 -*-
"""把七塊分鏡畫板組裝成一支連續播放的 player.html。

畫板是 12–14 秒的迴圈演示；成片每一幕長度不同，所以這裡做四件事：
  1. 抽出畫面區（1280×720），丟掉分鏡用的旁白條、字幕層與時間碼
  2. 把迴圈動畫改成單次播放（both），結尾不再淡出，畫面建立完就維持住
  3. 動畫總長等比拉到該幕的「建立期」，讓節拍跟旁白走
  4. 掛上 --seek，讓播放器能把任一幕推到任意進度（拖曳時間軸用）
"""
import io
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "scenes")
TPL = os.path.join(SRC, "player-template.html")
OUT = os.path.join(HERE, "player.html")

# 檔名, scene id, 畫板原本的迴圈長度, 成片裡這一幕的建立期
SCENES = [
    ("S01-Hook.dc.html",       "sc1", 12, 13),
    ("S02-Connectome.dc.html", "sc2", 13, 26),
    ("S03-Pipeline.dc.html",   "sc3", 14, 38),
    ("S04-Readout.dc.html",    "sc4", 14, 28),
    ("S05-Ablation.dc.html",   "sc5", 14, 32),
    ("S06-Caveats.dc.html",    "sc6", 14, 28),
    ("S07-Outro.dc.html",      "sc7", 12, 17),
]

SEEK = "animation-delay: var(--seek, 0s)"


def read(p):
    return io.open(p, encoding="utf-8").read()


def kf_blocks(css):
    """回傳 [(start, end, name, inner)]，end 為整個 @keyframes 區塊的結尾索引。"""
    out = []
    for m in re.finditer(r"@keyframes\s+([\w-]+)\s*\{", css):
        i = css.index("{", m.start())
        depth, j = 0, i
        while j < len(css):
            if css[j] == "{":
                depth += 1
            elif css[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        out.append((m.start(), j + 1, m.group(1), css[i + 1:j]))
    return out


def drop_tail_fade(inner):
    """單次播放不需要收尾淡出：刪掉最後那個單獨的 100% stop，讓前一個 stop 撐到 100%。"""
    stops = re.findall(r"([^{}]+)\{([^{}]*)\}", inner)
    if len(stops) < 2 or stops[-1][0].strip() != "100%":
        return inner
    parts = [p.strip() for p in stops[-2][0].split(",")]
    if not parts[-1].endswith("%"):
        return inner
    try:
        pct = float(parts[-1][:-1])
    except ValueError:
        return inner
    if pct < 88:
        return inner
    parts[-1] = "100%"
    kept = stops[:-1]
    kept[-1] = (", ".join(parts), kept[-1][1])
    return " " + " ".join("%s {%s}" % (sel.strip(), decl) for sel, decl in kept) + " "


def build_scene(fname, sid, loop_s, dur_s):
    src = read(os.path.join(SRC, fname))

    # --- CSS ---
    css = src.split("<style>", 1)[1].split("</style>", 1)[0]
    css = "\n".join(
        ln for ln in css.splitlines()
        if not ln.strip().startswith(("body {", "a { color", "* { animation-play-state"))
    )

    # 字幕改由播放器統一渲染，各幕的字幕 keyframes 不再需要
    for s, e, name, _ in reversed(kf_blocks(css)):
        if "-sub" in name:
            css = css[:s] + css[e:]

    for s, e, name, inner in reversed(kf_blocks(css)):
        fixed = drop_tail_fade(inner)
        if fixed != inner:
            css = css[:s] + "@keyframes %s {%s}" % (name, fixed) + css[e:]

    # 迴圈 → 單次播放 + 可 seek（只動主迴圈長度那些，裝飾性的短迴圈保持 infinite）
    css = re.sub(r"animation: ([\w-]+) (%ds) ([^;]*?) infinite" % loop_s,
                 r"animation: \1 \2 \3 both; %s" % SEEK, css)

    # --- 畫面 HTML ---
    head = '<div style="position: relative; width: 1280px; height: 720px;'
    html = src[src.index(head):src.index('\n  <div style="width: 1280px; height: 200px;')]
    sub = '<div style="position: absolute; left: 0; right: 0; bottom: 56px; display: grid; justify-items: center;">'
    if sub in html:
        a = html.index(sub)
        b = html.index("\n    </div>\n", a) + len("\n    </div>\n")
        html = html[:a] + html[b:]
    html = re.sub(r"[ \t]*<div style=\"position: absolute; right: 24px; bottom: 16px;[^\n]*\n", "", html)

    # S07 的 ◈ 標記同時掛了「彈入」與「呼吸光暈」兩個動畫：彈入要單次＋可 seek，
    # 光暈要一直呼吸，兩者的 delay 必須各給各的，不能走下面的通用規則。
    S7 = "animation: s7-mark 12s cubic-bezier(.2,1.3,.4,1) infinite, s7-glow 3.4s ease-in-out infinite;"
    html = html.replace(S7, "@@S7MARK@@")

    html = re.sub(r"animation: ([\w-]+) (%ds) ([^;\"]*?) infinite;" % loop_s,
                  r"animation: \1 \2 \3 both; %s;" % SEEK, html)

    html = html.replace(
        "@@S7MARK@@",
        "animation: s7-mark 12s cubic-bezier(.2,1.3,.4,1) both, s7-glow 3.4s ease-in-out infinite; "
        "animation-delay: var(--seek, 0s), 0s;")

    # 動畫總長：迴圈演示 → 這一幕的建立期
    if dur_s != loop_s:
        css = re.sub(r"(?<![\d.])%ds" % loop_s, "%ds" % dur_s, css)
        html = re.sub(r"(?<![\d.])%ds" % loop_s, "%ds" % dur_s, html)

    css = "\n".join("  " + ln.strip() for ln in css.splitlines() if ln.strip())
    html = "\n".join("    " + ln for ln in html.rstrip().splitlines())
    return ("/* ---- %s ---- */\n" % sid) + css, '    <div class="scene" id="%s">\n%s\n    </div>' % (sid, html)


styles, scenes = [], []
for fname, sid, loop_s, dur_s in SCENES:
    c, h = build_scene(fname, sid, loop_s, dur_s)
    styles.append(c)
    scenes.append(h)

page = read(TPL)
page = page.replace("/*SCENE_STYLES*/", "\n".join(styles))
page = page.replace("/*SCENES*/", "\n".join(scenes))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
io.open(OUT, "w", encoding="utf-8", newline="\n").write(page)

print("written:", OUT, len(page), "bytes")
for bad in ("infinite;  animation-delay", "/*SCENES*/", "/*SCENE_STYLES*/", "{{playState}}"):
    if bad in page:
        print("WARN leftover:", bad)
print("infinite remaining:", page.count("infinite"))
print("seek hooks:", page.count("var(--seek"))

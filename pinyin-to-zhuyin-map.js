const pinyinToZhuyinMap = {};

const initials = {
  b: "ㄅ", p: "ㄆ", m: "ㄇ", f: "ㄈ",
  d: "ㄉ", t: "ㄊ", n: "ㄋ", l: "ㄌ",
  g: "ㄍ", k: "ㄎ", h: "ㄏ",
  j: "ㄐ", q: "ㄑ", x: "ㄒ",
  zh: "ㄓ", ch: "ㄔ", sh: "ㄕ", r: "ㄖ",
  z: "ㄗ", c: "ㄘ", s: "ㄙ",
  '': '' // For syllables without an initial
};

const finals = {
  a: "ㄚ", o: "ㄛ", e: "ㄜ", ê: "ㄝ",
  ai: "ㄞ", ei: "ㄟ", ao: "ㄠ", ou: "ㄡ",
  an: "ㄢ", en: "ㄣ", ang: "ㄤ", eng: "ㄥ", er: "ㄦ",
  i: "ㄧ", u: "ㄨ", ü: "ㄩ",
  ia: "ㄧㄚ", ie: "ㄧㄝ", iao: "ㄧㄠ", iou: "ㄧㄡ",
  ian: "ㄧㄢ", in: "ㄧㄣ", iang: "ㄧㄤ", ing: "ㄧㄥ", iong: "ㄩㄥ",
  ua: "ㄨㄚ", uo: "ㄨㄛ", uai: "ㄨㄞ", uei: "ㄨㄟ",
  uan: "ㄨㄢ", uen: "ㄨㄣ", uang: "ㄨㄤ", ueng: "ㄨㄥ",
  üe: "ㄩㄝ", üan: "ㄩㄢ", ün: "ㄩㄣ"
};

const exceptions = {
  zhi: "ㄓ", chi: "ㄔ", shi: "ㄕ", ri: "ㄖ",
  zi: "ㄗ", ci: "ㄘ", si: "ㄙ",
  yi: "ㄧ", wu: "ㄨ", yu: "ㄩ",
  yü: "ㄩ",
  y: "ㄧ",
  w: "ㄨ"
};

const toneMap = { 1: "", 2: "ˊ", 3: "ˇ", 4: "ˋ", 5: "˙" };

// Generate combinations
for (const initialKey in initials) {
  for (const finalKey in finals) {
    const pinyin = initialKey + finalKey;
    if (pinyin === '') continue; // Skip empty pinyin

    // Handle special cases first
    if (exceptions[pinyin]) {
      for (let toneNum = 1; toneNum <= 5; toneNum++) {
        pinyinToZhuyinMap[pinyin + toneNum] = exceptions[pinyin] + (toneMap[toneNum] || '');
      }
      continue; // Skip to next combination
    }

    // General combinations
    const zhuyinInitial = initials[initialKey];
    const zhuyinFinal = finals[finalKey];

    if (zhuyinInitial && zhuyinFinal) {
      for (let toneNum = 1; toneNum <= 5; toneNum++) {
        pinyinToZhuyinMap[pinyin + toneNum] = zhuyinInitial + zhuyinFinal + (toneMap[toneNum] || '');
      }
    } else if (zhuyinFinal) { // Syllables with no initial (e.g., 'a', 'o', 'e')
      for (let toneNum = 1; toneNum <= 5; toneNum++) {
        pinyinToZhuyinMap[pinyin + toneNum] = zhuyinFinal + (toneMap[toneNum] || '');
      }
    }
  }
}

// Add exceptions that might not be covered by combinations (e.g., 'er')
for (const exceptionPinyin in exceptions) {
  for (let toneNum = 1; toneNum <= 5; toneNum++) {
    pinyinToZhuyinMap[exceptionPinyin + toneNum] = exceptions[exceptionPinyin] + (toneMap[toneNum] || '');
  }
}

// Manually add some common missing ones or corrections
pinyinToZhuyinMap["ru4"] = "ㄖㄨˋ";
pinyinToZhuyinMap["dui4"] = "ㄉㄨㄟˋ";
pinyinToZhuyinMap["cun4"] = "ㄘㄨㄣˋ";
pinyinToZhuyinMap["zhu3"] = "ㄓㄨˇ";
pinyinToZhuyinMap["xin1"] = "ㄒㄧㄣ";
pinyinToZhuyinMap["da2"] = "ㄉㄚˊ";
pinyinToZhuyinMap["zhui4"] = "ㄓㄨㄟˋ";
pinyinToZhuyinMap["lang2"] = "ㄌㄤˊ";
pinyinToZhuyinMap["qiang1"] = "ㄑㄧㄤ";
pinyinToZhuyinMap["jian4"] = "ㄐㄧㄢˋ";
pinyinToZhuyinMap["pian1"] = "ㄆㄧㄢ";
pinyinToZhuyinMap["qian2"] = "ㄑㄧㄢˊ";
pinyinToZhuyinMap["tou1"] = "ㄊㄡ";
pinyinToZhuyinMap["hua2"] = "ㄏㄨㄚˊ";
pinyinToZhuyinMap["bo1"] = "ㄅㄛ";
pinyinToZhuyinMap["pu1"] = "ㄆㄨ";
pinyinToZhuyinMap["qiu2"] = "ㄑㄧㄡˊ";
pinyinToZhuyinMap["long2"] = "ㄌㄨㄥˊ";
pinyinToZhuyinMap["si4"] = "ㄙˋ";
pinyinToZhuyinMap["na2"] = "ㄋㄚˊ";
pinyinToZhuyinMap["yue4"] = "ㄩㄝˋ";
pinyinToZhuyinMap["chen2"] = "ㄔㄣˊ";
pinyinToZhuyinMap["zhen1"] = "ㄓㄣ";
pinyinToZhuyinMap["chu4"] = "ㄔㄨˋ";
pinyinToZhuyinMap["suo3"] = "ㄙㄨㄛˇ";
pinyinToZhuyinMap["ba2"] = "ㄅㄚˊ";
pinyinToZhuyinMap["yi4"] = "ㄧˋ";
pinyinToZhuyinMap["te4"] = "ㄊㄜˋ";
pinyinToZhuyinMap["shi4"] = "ㄕˋ";
pinyinToZhuyinMap["qian2"] = "ㄑㄧㄢˊ";
pinyinToZhuyinMap["ning2"] = "ㄋㄧㄥˊ";
pinyinToZhuyinMap["han2"] = "ㄏㄢˊ";
pinyinToZhuyinMap["zhen4"] = "ㄓㄣˋ";
pinyinToZhuyinMap["bu4"] = "ㄅㄨˋ";
pinyinToZhuyinMap["she2"] = "ㄕㄜˊ";

module.exports = pinyinToZhuyinMap;

console.log(`DEBUG: pinyinToZhuyinMap generated with ${Object.keys(pinyinToZhuyinMap).length} entries.`);
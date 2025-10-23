const fs = require("fs");
const boshiamyData = require("./boshiamy-data.js");
const pinyinToZhuyinMap = require("./pinyin-to-zhuyin-map.js");
const charToPinyinMap = require("./char-to-pinyin-map.js"); // New import

function getZhuyin(char) {
  console.log(`getZhuyin 處理字元: ${char}`);
  try {
    const charCode = char.charCodeAt(0);
    let isHanzi =
      (charCode >= 0x4e00 && charCode <= 0x9fff) ||
      (charCode >= 0x3400 && charCode <= 0x4dbf);
    if (!isHanzi && char.length === 2) {
      const highSurrogate = char.charCodeAt(0);
      const lowSurrogate = char.charCodeAt(1);
      if (
        highSurrogate >= 0xd800 &&
        highSurrogate <= 0xdbff &&
        lowSurrogate >= 0xdc00 &&
        lowSurrogate <= 0xdfff
      ) {
        const codePoint =
          0x10000 + (highSurrogate - 0xd800) * 0x400 + (lowSurrogate - 0xdc00);
        isHanzi =
          (codePoint >= 0x20000 && codePoint <= 0x2a6df) ||
          (codePoint >= 0x2a700 && codePoint <= 0x2b73f) ||
          (codePoint >= 0x2b740 && codePoint <= 0x2b81f) ||
          (codePoint >= 0x2b820 && codePoint <= 0x2ceaf) ||
          (codePoint >= 0x2ceb0 && codePoint <= 0x2ebef) ||
          (codePoint >= 0x30000 && codePoint <= 0x3134f);
      }
    }

    if (!isHanzi) {
      console.log(`字元 ${char} 不是漢字，跳過。`);
      return null;
    }

    // Get pinyin directly from charToPinyinMap
    const pinyinWithToneNum = charToPinyinMap[char];

    if (pinyinWithToneNum) {
      console.log(`DEBUG: Looking up pinyin: '${pinyinWithToneNum}'`); // New debug log
      const zhuyin = pinyinToZhuyinMap[pinyinWithToneNum];
      console.log(`DEBUG: Lookup result: '${zhuyin}'`); // New debug log
      if (zhuyin) {
        return zhuyin;
      } else {
        console.warn(`無法在拼音到注音映射表中找到拼音: ${pinyinWithToneNum} (來自字元: ${char})`);
        return null;
      }
    } else {
      console.warn(`無法在漢字到拼音映射表中找到字元: ${char}`);
      return null;
    }
  } catch (error) {
    console.error(`getZhuyin 處理字元 ${char} 時發生錯誤:`, error);
    return null;
  }
}

// --- 轉換主函式 ---
function convertBoshiamyToZhuyin(boshiamyData) {
  const zhuyinData = {};
  let processedCount = 0;
  let totalCodes = Object.keys(boshiamyData).length;
  let currentCodeIndex = 0;

  console.log("開始轉換...");
  console.log(`總共有 ${totalCodes} 個嘸蝦米碼需要處理。`);

  for (const code in boshiamyData) {
    currentCodeIndex++;
    if (boshiamyData.hasOwnProperty(code)) {
      const characters = boshiamyData[code];
      for (const char of characters) {
        console.log(`處理字元: ${char} (來自碼: ${code})`);
        if (zhuyinData[char] === undefined) {
          const zhuyin = getZhuyin(char);
          zhuyinData[char] = zhuyin;
          processedCount++;
        }
      }
    }
    // 進度顯示 (每處理 1000 個代碼顯示一次)
    if (currentCodeIndex % 1000 === 0 || currentCodeIndex === totalCodes) {
      console.log(
        `已處理 ${currentCodeIndex} / ${totalCodes} 個嘸蝦米碼，找到 ${processedCount} 個獨立字元...`
      );
    }
  }
  console.log(`轉換完成！共處理 ${processedCount} 個獨立字元。`);
  return zhuyinData;
}

// --- 執行轉換 ---
const zhuyinDataResult = convertBoshiamyToZhuyin(boshiamyData);

// --- 格式化輸出字串 ---
console.log("正在格式化輸出字串...");
let outputString = "const zhuyinData = {\n";
let outputCount = 0;
const totalOutputChars = Object.keys(zhuyinDataResult).length;

for (const char in zhuyinDataResult) {
  if (zhuyinDataResult.hasOwnProperty(char)) {
    const zhuyin = zhuyinDataResult[char];
    const escapedChar = char
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"');
    outputString += `  "${escapedChar}": ${zhuyin === null ? "null" : `"${zhuyin}"`},
`;
    outputCount++;
    // 進度顯示 (可選)
    if (outputCount % 1000 === 0) {
      console.log(`已格式化 ${outputCount} / ${totalOutputChars} 個字元...`);
    }
  }
}
if (totalOutputChars > 0) {
  outputString = outputString.slice(0, -2); // 移除最後的 ',
'
}
outputString += "\n};";
console.log("格式化完成。");

// --- 將結果寫入檔案 ---
const outputFilename = "zhuyin-data.js";
console.log(`正在將結果寫入檔案: ${outputFilename}...`);
try {
  fs.writeFileSync(outputFilename, outputString, "utf8");
  console.log(`成功將注音資料寫入 ${outputFilename}`);
} catch (err) {
  console.error(`寫入檔案 ${outputFilename} 時發生錯誤:`, err);
}
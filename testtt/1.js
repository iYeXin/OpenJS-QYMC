const fs = require('fs');

// 文件路径
const filePath = './123.log';

try {
    // 获取文件大小
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    // 计算要读取的起始位置和长度（最多 1024 字节）
    const chunkSize = 1024;
    const startPos = fileSize > chunkSize ? fileSize - chunkSize : 0;
    const readLength = fileSize - startPos;

    // 打开文件
    const fd = fs.openSync(filePath, 'r');

    // 创建缓冲区
    const buffer = Buffer.alloc(readLength);

    // 读取数据
    fs.readSync(fd, buffer, 0, readLength, startPos);

    // 关闭文件
    fs.closeSync(fd);

    // 打印十六进制（每行16字节，带偏移量和ASCII显示）
    printHex(buffer);
} catch (err) {
    console.error('读取文件失败：', err.message);
}

/**
 * 以 hexdump 风格打印缓冲区内容
 * @param {Buffer} buf 要打印的缓冲区
 */
function printHex(buf) {
    const bytesPerLine = 16;
    const totalBytes = buf.length;

    for (let i = 0; i < totalBytes; i += bytesPerLine) {
        // 偏移量（起始位置）
        const offset = i;
        // 当前行实际字节数（最后一行可能不足16）
        const lineBytes = Math.min(bytesPerLine, totalBytes - i);
        // 十六进制部分
        const hexParts = [];
        for (let j = 0; j < lineBytes; j++) {
            const byte = buf[i + j];
            hexParts.push(byte.toString(16).padStart(2, '0'));
        }
        // 补全至16个字节（用于对齐显示）
        const hexStr = hexParts.join(' ').padEnd(bytesPerLine * 3 - 1, ' ');
        // ASCII 部分（可打印字符显示为本身，否则显示 '.'）
        let asciiStr = '';
        for (let j = 0; j < lineBytes; j++) {
            const ch = buf[i + j];
            asciiStr += (ch >= 32 && ch <= 126) ? String.fromCharCode(ch) : '.';
        }
        // 输出格式：偏移量  十六进制   ASCII
        console.log(`${offset.toString(16).padStart(8, '0')}  ${hexStr}  ${asciiStr}`);
    }
}
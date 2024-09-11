import sharp from "sharp";
import Jimp from "jimp";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

// Bước 1: Tăng độ phân giải của ảnh
async function increaseResolution(imagePath, outputPath) {
  await sharp(imagePath)
    .resize({ factor: 4 }) // Tăng độ phân giải lên 400%
    .toFile(outputPath);
}

// Bước 2: Tách nền và làm việc với lớp nền
async function separateBackgroundAndDuplicate(imagePath) {
  const image = await Jimp.read(imagePath);
  image.background(0x00000000); // Đặt nền trong suốt
  return image.clone(); // Nhân bản lớp nền
}

// Bước 3: Tạo nền và kết hợp với hiệu ứng sự khác biệt
async function mergeWithDifference(duplicatedLayer, shirtColor) {
  const bgColor = shirtColor === "black" ? 0x000000ff : 0xffffffff; // Đen hoặc trắng
  const backgroundLayer = new Jimp(
    duplicatedLayer.bitmap.width,
    duplicatedLayer.bitmap.height,
    bgColor
  );
  duplicatedLayer.composite(backgroundLayer, 0, 0, {
    mode: Jimp.BLEND_DIFFERENCE,
  });
  return duplicatedLayer;
}

// Bước 4: Lưu lớp nền đã nhân bản vào tệp mới
async function saveDuplicatedLayer(duplicatedLayer, outputPath) {
  await duplicatedLayer.writeAsync(outputPath);
}

// Bước 5: Chuyển đổi sang Grayscale
async function convertToGrayscale(imagePath, outputPath) {
  const image = await Jimp.read(imagePath);
  image.grayscale();
  await image.writeAsync(outputPath);
}

// Bước 6: Điều chỉnh mức grayscale
async function adjustGrayscaleLevels(
  imagePath,
  outputPath,
  brightness = 0,
  contrast = 0
) {
  const image = await Jimp.read(imagePath);
  image.grayscale(); // Chuyển ảnh thành grayscale

  // Điều chỉnh brightness và contrast
  image.brightness(brightness / 100); // brightness từ -1 đến 1
  image.contrast(contrast / 100); // contrast từ -1 đến 1

  await image.writeAsync(outputPath);
}

// Bước 7: Chuyển đổi sang Half-tone (Bitmap)
async function convertToBitmap(
  imagePath,
  outputPath,
  dpi,
  frequency = 35,
  angle = 22
) {
  const image = await Jimp.read(imagePath);
  const canvas = createCanvas(image.bitmap.width, image.bitmap.height);
  const ctx = canvas.getContext("2d");
  const img = await loadImage(imagePath);
  ctx.drawImage(img, 0, 0);

  // Mô phỏng chuyển đổi Bitmap
  ctx.filter = `grayscale(${frequency}%) contrast(${angle}%)`;
  ctx.drawImage(canvas, 0, 0);

  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  out.on("finish", () => console.log("Bitmap created."));
}

// Bước 8: Tạo mask lớp và dán bitmap
async function createLayerMask(originalPath, bitmapPath, outputPath) {
  const originalImage = await Jimp.read(originalPath);
  const bitmapImage = await Jimp.read(bitmapPath);
  originalImage.mask(bitmapImage, 0, 0);
  await originalImage.writeAsync(outputPath);
}

// Bước 9: Điều chỉnh màu sắc
async function adjustColor(
  imagePath,
  outputPath,
  brightness = 70,
  contrast = -50,
  saturation = 30
) {
  const image = await Jimp.read(imagePath);
  image.brightness(brightness / 100);
  image.contrast(contrast / 100);
  image.color([{ apply: "saturate", params: [saturation] }]);
  await image.writeAsync(outputPath);
}

// Bước 10-12: Gộp các lớp, thêm đường viền và thay đổi kích thước
async function finalizeImage(originalPath, outputPath, dpi) {
  const image = await Jimp.read(originalPath);
  image.contain(image.bitmap.width / 4, image.bitmap.height / 4); // Thay đổi kích thước về dpi gốc
  await image.writeAsync(outputPath);
}

// So sánh hai ảnh và lưu ảnh chênh lệch
function compareImages(imgPath1, imgPath2, diffPath) {
  const img1 = PNG.sync.read(fs.readFileSync(imgPath1));
  const img2 = PNG.sync.read(fs.readFileSync(imgPath2));
  const { width, height } = img1;

  if (width !== img2.width || height !== img2.height) {
    throw new Error("Ảnh không có cùng kích thước.");
  }

  const diff = new PNG({ width, height });
  const numDiffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 }
  );
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  console.log(`Số lượng pixel khác biệt: ${numDiffPixels}`);
}

// Chạy các bước
async function processImage() {
  const originalPath = "./assets/inputImg.jpg"; // Đổi đường dẫn ảnh đầu vào
  const highResPath = "high_res.png";
  const duplicatedPath = "duplicated.png";
  const grayscalePath = "grayscale.png";
  const bitmapPath = "bitmap.png";
  const finalPath = "final.png";
  const diffPath = "diff.png";

  await increaseResolution(originalPath, highResPath);
  const duplicatedLayer = await separateBackgroundAndDuplicate(highResPath);
  const mergedLayer = await mergeWithDifference(duplicatedLayer, "black");
  await saveDuplicatedLayer(mergedLayer, duplicatedPath);
  await convertToGrayscale(duplicatedPath, grayscalePath);
  await adjustGrayscaleLevels(grayscalePath, grayscalePath);
  await convertToBitmap(grayscalePath, bitmapPath, 600);
  await createLayerMask(originalPath, bitmapPath, finalPath);
  await adjustColor(finalPath, finalPath);
  await finalizeImage(finalPath, finalPath, 200);

  // So sánh ảnh gốc và ảnh đã xử lý
  compareImages(originalPath, finalPath, diffPath);
}

processImage().catch(console.error);

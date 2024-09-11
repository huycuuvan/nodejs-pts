import sharp from "sharp";
import Jimp from "jimp";
import fs from "fs";
import { removeBackgroundFromImageBase64 } from "remove.bg";
import { createCanvas, loadImage } from "canvas";
import axios from "axios";
import FormData from "form-data";
// Step 1: Open the image and increase resolution by 400%
async function increaseResolution(imagePath, outputPath) {
  const image = await sharp(imagePath)
    .resize({ factor: 4 }) // Increase resolution by 400%
    .toFile(outputPath);
  console.log("Tăng độ phân giải xong!");
  return image;
}
// Step 2: Tách nền bằng BodyPix
// async function removeBackgroundWithBodyPix(imagePath, outputPath) {
//   const net = await bodyPix.load(); // Load BodyPix model

//   // Load image using sharp and convert to Tensor
//   const image = await sharp(imagePath)
//     .raw()
//     .toBuffer({ resolveWithObject: true });
//   const tensor = tf.tensor3d(new Uint8Array(image.data), [
//     image.info.height,
//     image.info.width,
//     3,
//   ]);

//   // Segment the image to detect person
//   const segmentation = await net.segmentPerson(tensor);

//   // Create mask for the person (where 1 = person, 0 = background)
//   const maskImage = segmentation.data.map((segmentationValue) =>
//     segmentationValue === 1 ? 255 : 0
//   );

//   // Convert the mask to an image buffer
//   const maskBuffer = Buffer.from(maskImage);
//   const mask = sharp(maskBuffer, {
//     raw: {
//       width: segmentation.width,
//       height: segmentation.height,
//       channels: 1,
//     },
//   });

//   // Save the mask as a PNG
//   await mask.toFile(outputPath);
//   console.log("Tách nền bằng BodyPix xong!");
// }
// Step 2: Separate the background and work on the duplicated layer
async function separateBackgroundAndDuplicate(imagePath) {
  const image = await Jimp.read(imagePath);

  // Convert image to greyscale (optional step to improve contrast between background and foreground)
  image.greyscale();

  // Apply thresholding to convert it into binary image
  image.threshold({ max: 128 }); // 128 as threshold value

  // Invert the colors, making the background black and the subject white
  image.invert();

  // Set transparent background
  const transparentBackgroundImage = await image.background(0x00000000);

  // Clone the image
  const duplicated = transparentBackgroundImage.clone();
  console.log("Tách nền và tạo lớp trùng lặp xong!");

  return duplicated;
}

// Function to remove background using remove.bg API
async function myRemoveBgFunction(path, outputFile) {
  const base64img = fs.readFileSync(path, { encoding: "base64" });
  const result = await removeBackgroundFromImageBase64({
    base64img,
    outputFile,
    apiKey: "73gRjFzA9ERewEUcGJycjk1r",
    size: "preview",
    type: "auto",
    bg_color: "red",
  })
    .then((result) => {
      console.log(`File saved to ${outputFile}`);
      console.log(`${result.creditsCharged} credit(s) charged for this image`);
      console.log(
        `Result width x height: ${result.resultWidth} x ${result.resultHeight}, type: ${result.detectedType}`
      );
      console.log(result.base64img.substring(0, 40) + "..");
    })
    .catch((errors) => {
      console.log(JSON.stringify(errors));
    });

  return result;
}
// Step 3: Create background and merge with difference effect
async function mergeWithDifference(duplicatedLayer, shirtColor) {
  const bgColor = shirtColor === "black" ? 0x000000ff : 0xffffffff; // Black or white
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
// Step 9: Adjust color
async function adjustColor(
  imagePath,
  outputPath,
  brightness = -0.3,
  contrast = 8,
  saturation = 10
) {
  const image = await Jimp.read(imagePath);
  image.brightness(brightness / 100);
  image.contrast(contrast / 100);
  image.color([{ apply: "saturate", params: [saturation] }]);
  await image.writeAsync(outputPath);
  console.log("Điều chỉnh màu xong!");
}

// Step 4: Duplicate merged background layer to a new file
async function saveDuplicatedLayer(duplicatedLayer, outputPath) {
  await duplicatedLayer.writeAsync(outputPath);
}

// Step 5: Convert to grayscale
async function convertToGrayscale(imagePath, outputPath) {
  const image = await Jimp.read(imagePath);
  image.grayscale();
  await image.writeAsync(outputPath);
}

// Step 6: Adjust grayscale level
// Thay vì sử dụng image.levels, ta có thể dùng hàm khác
async function adjustGrayscaleLevels(imagePath, outputPath) {
  const image = await Jimp.read(imagePath);
  image.brightness(0.1); // Điều chỉnh độ sáng (từ -1 đến 1)
  image.contrast(0.5); // Điều chỉnh độ tương phản (từ -1 đến 1)
  await image.writeAsync(outputPath);
  console.log("Điều chỉnh grayscale hoàn thành!");
}

// Step 7: Convert to halftone (Bitmap)
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

  // Simulate Bitmap conversion
  ctx.filter = `grayscale(${frequency}%) contrast(${angle}%)`;
  ctx.drawImage(canvas, 0, 0);

  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  out.on("finish", () => console.log("Bitmap created."));
}

// Step 8: Create layer mask and paste bitmap
async function createLayerMask(originalPath, bitmapPath, outputPath) {
  const originalImage = await Jimp.read(originalPath);
  const bitmapImage = await Jimp.read(bitmapPath);

  originalImage.mask(bitmapImage, 0, 0);
  await originalImage.writeAsync(outputPath);
}

// Step 10-12: Merge layers, stroke, resize to original dpi
async function finalizeImage(originalPath, outputPath, dpi) {
  const image = await Jimp.read(originalPath);
  image.contain(image.bitmap.width / 4, image.bitmap.height / 4); // Resize to original dpi
  await image.writeAsync(outputPath);
}

async function applyHalftoneEffectOnShadows(imagePath, outputPath) {
  // Tải ảnh
  const img = await loadImage(imagePath);
  const width = img.width;
  const height = img.height;

  // Tạo canvas để vẽ ảnh
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Vẽ ảnh lên canvas
  ctx.drawImage(img, 0, 0, width, height);

  // Lấy dữ liệu pixel của ảnh
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Thiết lập kích thước chấm lưới
  const size = 3;

  // Áp dụng hiệu ứng halftone chỉ cho các vùng tối (vùng bóng)
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const pixelIndex = (y * width + x) * 4;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];

      // Tính giá trị độ sáng trung bình của pixel
      const brightness = (r + g + b) / 3;

      // Chỉ áp dụng hiệu ứng halftone cho các vùng tối (bóng)
      if (brightness < 128) {
        const radius = ((255 - brightness) / 255) * (size / 2);

        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, radius, 0, 2 * Math.PI);
        ctx.fillStyle = `(rgb(100, 100, 100))`; // Màu chấm là xám
        ctx.fill();
      }
    }
  }

  // Lưu ảnh đã áp dụng hiệu ứng halftone
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createJPEGStream();
  stream.pipe(out);
  out.on("finish", () => console.log("Halftone effect applied to shadows."));
}
async function removeBackground(inputFile, outputFile, bgColor) {
  const image = await Jimp.read(inputFile);

  const targetColor = Jimp.cssColorToHex(bgColor); // Chuyển đổi màu sắc thành hex

  image.scan(
    0,
    0,
    image.bitmap.width,
    image.bitmap.height,
    function (x, y, idx) {
      // Lấy giá trị màu tại pixel
      const red = this.bitmap.data[idx + 0];
      const green = this.bitmap.data[idx + 1];
      const blue = this.bitmap.data[idx + 2];

      const pixelColor = Jimp.rgbaToInt(red, green, blue, 255);

      // So sánh màu pixel với màu nền
      if (pixelColor === targetColor) {
        // Nếu pixel là nền, biến nó thành trong suốt
        this.bitmap.data[idx + 3] = 0; // Alpha channel (0 là trong suốt)
      }
    }
  );

  await image.writeAsync(outputFile);
  console.log(`Image with background removed saved to ${outputFile}`);
}

async function removeBackgroundWithSlazzer(inputImg, outputImg) {
  try {
    // Tạo một đối tượng FormData
    const formData = new FormData();
    formData.append("source_image", fs.createReadStream(inputImg));

    const response = await axios({
      method: "POST",
      url: "https://api.slazzer.com/v2.0/remove_image_background",
      headers: {
        "API-KEY": "082a2068bd604307b44492b2d3dde089",
      },
      formData: formData,
      responseType: "arraybuffer", // Nhận dữ liệu hình ảnh
    });

    // Lưu hình ảnh đã tách nền
    fs.writeFileSync(outputImg, response.data);
    console.log("Đã lưu ảnh đã tách nền thành công!");
  } catch (error) {
    // In thông tin chi tiết lỗi để chẩn đoán
    if (error.response) {
      // Yêu cầu đã được gửi và máy chủ đã phản hồi với mã trạng thái không thành công
      console.error("Lỗi từ máy chủ:", error.response.data);
      console.error("Mã trạng thái:", error.response.status);
      console.error("Tiêu đề:", error.response.headers);
    } else if (error.request) {
      // Yêu cầu đã được gửi nhưng không nhận được phản hồi
      console.error("Yêu cầu không được đáp ứng:", error.request);
    } else {
      // Xảy ra lỗi trong khi thiết lập yêu cầu
      console.error("Lỗi thiết lập yêu cầu:", error.message);
    }
  }
}

// Main function to execute the steps
async function processImage() {
  console.log("Bắt đầu quá trình chỉnh sửa...");
  const originalPath = "./assets/bgRemove.png"; //bgRemove.png
  const highResPath = "./assets/outputImg.jpg";
  const duplicatedPath = "duplicated.png";
  const grayscalePath = "grayscale.png";
  const bitmapPath = "bitmap.png";
  const finalPath = "./assets/outputImg.jpg";
  const rmBg = "./assets/bgRemoved.jpg";

  // await increaseResolution(originalPath, highResPath);
  // const duplicatedLayer = await separateBackgroundAndDuplicate(originalPath);
  // const mergedLayer = await mergeWithDifference(duplicatedLayer, "black");
  // await saveDuplicatedLayer(mergedLayer, duplicatedPath);
  // await convertToGrayscale(duplicatedPath, grayscalePath);
  // await adjustGrayscaleLevels(grayscalePath, grayscalePath);
  // await convertToBitmap(grayscalePath, bitmapPath, 600);
  // await createLayerMask(originalPath, bitmapPath, finalPath);
  // await adjustColor(finalPath, finalPath);
  // await finalizeImage(finalPath, finalPath, 200);
  // await applyHalftoneEffectOnShadows(originalPath, finalPath);

  // await myRemoveBgFunction(bitmapPath, rmBg);
  // await removeBackgroundWithBodyPix(originalPath, rmBg);

  await removeBackgroundWithSlazzer(originalPath, rmBg);
}
processImage().catch(console.error);

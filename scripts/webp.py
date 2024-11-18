# python scripts/webp.py content/images/flower.jpg
import argparse
from PIL import Image
import os


def convert_to_webp(input_path, quality):
    # 출력 경로 생성 (확장자만 변경)
    output_path = os.path.splitext(input_path)[0] + '.webp'

    with Image.open(input_path) as img:
        img.save(output_path, format='webp', quality=quality)
    print(f"Image successfully converted to {output_path} with quality {quality}")


def main():
    parser = argparse.ArgumentParser(
        description="Convert images to WebP format.")
    parser.add_argument('input', type=str,
                        help="Path to the input image file.")
    parser.add_argument('--quality', type=int, default=90,
                        help="Quality of the output WebP file (default: 100).")

    args = parser.parse_args()
    convert_to_webp(args.input, args.quality)


if __name__ == "__main__":
    main()

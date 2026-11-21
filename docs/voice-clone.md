# 克隆音色（GPT-SoVITS）

桌宠默认用 Windows 自带的 System.Speech 朗读，音色干净但机械。想要「像某个人的声音」，可以接一个本机的
[GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) 服务：给一段 3~10 秒的参考音频 + 这段音频的文字，
它就能用那个音色念任何台词。

> 说话人是「参考音频里那个人」，不是模型本身。请只使用你有权使用的声音（自己的录音、已获授权的配音），
> 不要克隆他人声音去冒充。生成的音频只在本机播放，桌宠不会上传参考音频。

## 一、这套方案长什么样

```
桌宠主进程 ──POST /tts──▶ 127.0.0.1:9880 (GPT-SoVITS api_v2) ──▶ wav(base64)
   ▲                                                              │
   └──────────────── 气泡文字先出，音频随后播放 ◀──────────────────┘
```

- 服务常驻本机，桌宠只发 HTTP 请求，不内嵌模型、不增加安装包体积。
- 参考音频和台词都写在 `ai-settings.json` 里，面板上也能改。
- 服务没开时语音静默失败（气泡照常），不会卡住对话。

## 二、装 GPT-SoVITS（Windows，一次性）

以下命令在 Git Bash 里执行；本机实测可用（RTX 3060 Laptop 6G，CUDA 121 轮子）。

```bash
# 1. 源码（GitHub 直连慢，走 ghfast 代理）
mkdir -p /d/GPT-SoVITS && cd /d/GPT-SoVITS
curl -fL -o gsv.zip "https://ghfast.top/https://github.com/RVC-Boss/GPT-SoVITS/archive/refs/heads/main.zip"
powershell -Command "Expand-Archive -Force gsv.zip ."

# 2. 独立 Python 3.10（不要动系统 python）
curl -fL -o py310.exe https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe
./py310.exe /quiet InstallAllUsers=0 PrependPath=0 Include_test=0 Include_launcher=0 TargetDir=D:\GPT-SoVITS\py310

# 3. torch（阿里云镜像比官方快十倍）
./py310/python.exe -m pip install --find-links https://mirrors.aliyun.com/pytorch-wheels/cu121/ \
  "torch==2.5.1+cu121" "torchaudio==2.5.1+cu121"

# 4. 其余依赖（清华源）
./py310/python.exe -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple \
  numpy'<2.0' scipy librosa==0.10.2 numba pytorch-lightning'>=2.4' \
  transformers==4.49.0 peft'<0.18.0' sentencepiece cn2an pypinyin g2p_en jieba opencc \
  'fastapi[standard]' torchmetrics'<=1.5' x_transformers rotary_embedding_torch wordsegment \
  fast_langdetect split-lang ToJyutping g2pk2 ko_pron 'pydantic<=2.10.6' av'>=11' psutil \
  PyYAML chardet tqdm imageio-ffmpeg ffmpeg-python resampy onnxruntime matplotlib accelerate
```

几个**必须单独处理的坑**（都已在上面处理掉，改动代码时别退回）：

| 坑 | 现象 | 处理 |
| --- | --- | --- |
| `jieba_fast` 要编译 | 整批依赖回滚 | 装 `jieba`，再手写 `site-packages/jieba_fast/{__init__,posseg}.py` 转发（`posseg` 需从 `jieba` 借 `load_userdict`） |
| `transformers>=4.51` | `require users to upgrade torch to at least v2.6`（CVE-2025-32434） | 钉 `transformers==4.49.0`，配 torch 2.5.1 |
| pip 顺手升级 torch | CUDA 失效（装成 CPU 版） | `--force-reinstall --no-deps` 重装 cu121 轮子 |
| ffmpeg 找不到 | `[Errno 2] No such file` | 把 `imageio_ffmpeg` 自带的 ffmpeg.exe 复制到 `GPT-SoVITS-main/runtime/ffmpeg.exe` |
| fast_langdetect 缓存目录 | `Cache directory not found: .../pretrained_models/fast_langdetect` | 把 `site-packages/fast_langdetect/resources/lid.176.ftz` 复制到该目录 |

预训练权重（约 1.1GB，Hugging Face 被墙时用镜像）：

```bash
cd /d/GPT-SoVITS/GPT-SoVITS-main/GPT_SoVITS/pretrained_models
BASE=https://hf-mirror.com/lj1995/GPT-SoVITS/resolve/main
for f in chinese-hubert-base/config.json chinese-hubert-base/preprocessor_config.json \
         chinese-hubert-base/pytorch_model.bin chinese-roberta-wwm-ext-large/config.json \
         chinese-roberta-wwm-ext-large/tokenizer.json chinese-roberta-wwm-ext-large/pytorch_model.bin \
         "gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt" \
         gsv-v2final-pretrained/s2G2333k.pth; do
  mkdir -p "$(dirname "$f")"
  curl -fL -C - --retry 5 -o "$f" "$BASE/$f"
done
```

## 三、准备参考音频

要求：**3~10 秒、单个说话人、没有背景音乐、情绪平稳**。太长或带 BGM 会让音色跑偏。

```bash
# 从长音频里挑出最响的一段并归一化（脚本在 D:\GPT-SoVITS\prepare-ref.py）
D:/GPT-SoVITS/py310/python.exe prepare-ref.py "C:/Users/me/Videos/sample.mp3" "D:/GPT-SoVITS/ref/hutao-ref.wav"

# 想精确截取某一段
D:/GPT-SoVITS/py310/python.exe cut-ref.py "D:/GPT-SoVITS/ref/hutao-ref.wav" "D:/GPT-SoVITS/ref/hutao-b.wav" 4.6 9.0
```

然后转写成文字（必须和音频逐字对应，错字会明显影响相似度）。本机可以用 sherpa-onnx 的 SenseVoice 离线模型：

```bash
D:/dafeiyu/asr/sherpa-onnx-offline.exe --tokens=D:/dafeiyu/asr/tokens.txt \
  --sense-voice-model=D:/dafeiyu/asr/model.int8.onnx --sense-voice-use-itn=1 \
  "D:/GPT-SoVITS/ref/hutao-b.wav"
```

输出里的 `text` 就是参考台词。

## 四、启动服务

`D:\GPT-SoVITS\start-api.cmd`（双击即可，首次加载模型 20~60 秒）：

```bat
@echo off
chcp 65001 >nul
set HF_ENDPOINT=https://hf-mirror.com
cd /d D:\GPT-SoVITS\GPT-SoVITS-main
"D:\GPT-SoVITS\py310\python.exe" api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml
```

只想开机自动起：把 `start-api.cmd` 的快捷方式丢进 `shell:startup`。

服务起来后 `http://127.0.0.1:9880/docs` 能打开就说明就绪。

## 五、在桌宠里打开克隆音色

面板 →「AI」标签 →「偏好设置」：

| 字段 | 填什么 |
| --- | --- |
| 语音引擎 | `克隆音色（GPT-SoVITS）` |
| 克隆服务地址 | `http://127.0.0.1:9880` |
| 参考音频路径 | `D:\GPT-SoVITS\ref\hutao-b.wav`（绝对路径） |
| 参考台词 | 上一步转写出来的文字 |
| 参考台词语言 / 朗读语言 | 一般 `zh` / `zh` |

点「检查」确认服务在线，再点「试音」听一段。也可以直接改 `%APPDATA%\hutao-desktop-pet\ai-settings.json`：

```json
{
  "ttsEngine": "clone",
  "ttsApiUrl": "http://127.0.0.1:9880",
  "ttsRefAudio": "D:\\GPT-SoVITS\\ref\\hutao-b.wav",
  "ttsPromptText": "甚好甚好本堂主现在就来喂这道菜肴",
  "ttsPromptLang": "zh",
  "ttsTextLang": "zh"
}
```

## 六、性能与排障

- 首次请求会做 CUDA 预热，可能等 30~60 秒；之后一句话（约 5 秒音频）**约 4 秒**出音。桌宠的克隆请求超时是 90 秒。
- 音色不像：换更干净的参考音频、把参考台词改到与音频完全一致、控制在 3~10 秒。
- 念错字/漏字：换 `text_split_method`（默认 `cut5`），或缩短单次文本；桌宠气泡本来就限制在 110 字内。
- `connection refused`：服务没起或端口不是 9880。
- `tts failed: No module named xxx`：回第三节把缺的包装上。
- 显存不足（6G 卡同时开游戏）：GPT-SoVITS 约吃 3~4G，可以先关服务，桌宠会静默降级为不出声。

## 七、命令行自检

```bash
npm run smoke:ai      # 会检查 ai settings / api key / ai connection / 系统音色
                      # 引擎为 clone 时额外检查「克隆服务在线」与「真的合成出一段音频」
```

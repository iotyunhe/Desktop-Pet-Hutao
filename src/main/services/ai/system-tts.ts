import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface SystemTtsOptions {
  /** PowerShell 可执行文件，默认走系统自带的 powershell.exe。 */
  powershellPath?: string;
  timeoutMs?: number;
}

export interface SystemTtsAudio {
  audioBase64: string;
  mimeType: 'audio/wav';
  voice: string;
}

export interface TtsVoiceList {
  ok: boolean;
  voices: string[];
  error?: string;
}

const LIST_VOICES_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Speech',
  '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  'foreach ($voice in $synth.GetInstalledVoices()) {',
  '  if ($voice.Enabled) { Write-Output $voice.VoiceInfo.Name }',
  '}',
  '$synth.Dispose()'
].join('\n');

function buildSpeakScript(textPath: string, voiceBase64: string, outPath: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Speech',
    `$text = [IO.File]::ReadAllText('${textPath}', [Text.Encoding]::UTF8)`,
    `$voice = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${voiceBase64}'))`,
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    'try { if ($voice) { $synth.SelectVoice($voice) } } catch { }',
    '$synth.Rate = 1',
    '$synth.Volume = 100',
    `$synth.SetOutputToWaveFile('${outPath}')`,
    '$synth.Speak($text)',
    '$synth.Dispose()'
  ].join('\n');
}

/**
 * 用 Windows 自带的 SAPI5 合成语音，输出 WAV 的 base64。
 * 好处是彻底不用 TTS 云服务，不额外花钱、不需要第二把 Key。
 */
export class SystemTts {
  private readonly powershellPath: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: SystemTtsOptions = {}) {
    this.powershellPath = options.powershellPath ?? 'powershell.exe';
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  static isSupported(): boolean {
    return process.platform === 'win32';
  }

  async listVoices(): Promise<TtsVoiceList> {
    if (!SystemTts.isSupported()) {
      return { ok: false, voices: [], error: '系统语音目前只支持 Windows。' };
    }

    try {
      const { stdout } = await this.run('-Command', LIST_VOICES_SCRIPT);
      const voices = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      return voices.length > 0
        ? { ok: true, voices }
        : { ok: false, voices: [], error: '系统里没有可用的语音，去「设置 → 时间和语言 → 语音」装一个中文语音包。' };
    } catch (error) {
      return { ok: false, voices: [], error: toMessage(error, '读取系统语音列表失败。') };
    }
  }

  async speak(text: string, voice: string): Promise<SystemTtsAudio> {
    if (!SystemTts.isSupported()) {
      throw new Error('系统语音目前只支持 Windows。');
    }

    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (!cleanText) {
      throw new Error('没有可以朗读的文字。');
    }

    const workDir = mkdtempSync(join(tmpdir(), 'hutao-tts-'));
    const textPath = join(workDir, 'text.txt');
    const outPath = join(workDir, 'speech.wav');
    const scriptPath = join(workDir, 'speak.ps1');

    try {
      writeFileSync(textPath, cleanText, 'utf8');
      writeFileSync(scriptPath, buildSpeakScript(textPath, Buffer.from(voice, 'utf8').toString('base64'), outPath), 'ascii');
      await this.run('-ExecutionPolicy', 'Bypass', '-File', scriptPath);

      const audio = readFileSync(outPath);
      if (audio.length === 0) {
        throw new Error('系统语音没有生成音频。');
      }

      return {
        audioBase64: audio.toString('base64'),
        mimeType: 'audio/wav',
        voice
      };
    } finally {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        // 临时目录清理失败不影响朗读结果。
      }
    }
  }

  private run(...args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      execFile(
        this.powershellPath,
        ['-NoProfile', '-NonInteractive', ...args],
        { timeout: this.timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(toMessage(error, stderr)));
            return;
          }
          resolve({ stdout, stderr });
        }
      );
    });
  }
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 160);
  }
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim().slice(0, 160);
  }
  return '语音合成失败。';
}

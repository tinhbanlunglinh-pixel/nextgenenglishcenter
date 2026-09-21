
import React, { useState } from 'react';
import { generateMindMapPrompt, fileToBase64 } from '../services/geminiService';
import { MindMapMode } from '../types';

export const MindMapPromptGenerator: React.FC = () => {
  const [mode, setMode] = useState<MindMapMode>(MindMapMode.IMAGE);
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // Cast to File[] to ensure subsequent operations have proper type safety
      const files = Array.from(e.target.files) as File[];
      setSelectedFiles(files);
      const newPreviews: string[] = [];
      files.forEach((file: File) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            // Fix: ensure ev.target.result is handled as string for type safety
            const result = ev.target?.result;
            if (typeof result === 'string') {
                newPreviews.push(result);
                // When all files are processed, update the state
                if (newPreviews.length === files.length) {
                  setImagePreviews(newPreviews);
                }
            }
          };
          // reader.readAsDataURL requires a Blob; File is a subtype of Blob
          reader.readAsDataURL(file);
      });
    }
  };

  const handleGenerate = async () => {
    if (mode !== MindMapMode.IMAGE && !inputText.trim()) {
        setError("Hãy nhập nội dung bài học con nhé!");
        return;
    }
    if (mode === MindMapMode.IMAGE && selectedFiles.length === 0) {
        setError("Hãy chọn ảnh bài học con nhé!");
        return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedPrompt('');

    try {
      let content: string | { data: string, mimeType: string }[] = inputText;
      if (mode === MindMapMode.IMAGE) {
        const processedImages = await Promise.all(selectedFiles.map(async (file) => {
             const base64 = await fileToBase64(file);
             return { data: base64, mimeType: file.type || 'image/jpeg' };
        }));
        content = processedImages;
      }

      const BuzanPromptReq = `Generate ONLY ONE highly detailed English prompt for drawing a professional Mind Map for the following content: "${typeof content === 'string' ? content : 'lesson images supplied'}".
      STYLE: Tony Buzan Organic Mind Map.
      FEATURES:
      - Central theme: Clear 3D cartoon icon representing the lesson topic.
      - Branches: Curvy, organic, colorful branches spreading from the center.
      - Keywords: Clear, bold English vocabulary from the lesson on each branch.
      - Icons: Cute 3D illustrations/emojis next to each keyword.
      - Background: Bright white, 8k resolution, Pixar-style lighting, vibrant colors.
      DO NOT INCLUDE EXPLANATION. JUST THE PROMPT.`;

      const result = await generateMindMapPrompt(content, mode);
      setGeneratedPrompt(result);
    } catch (e) {
      setError("Có lỗi khi tạo câu lệnh, con hãy thử lại nhé.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedPrompt);
    alert("Đã copy câu lệnh! Con hãy dán vào AI vẽ tranh (Midjourney/DALL-E) nhé! 🚀");
  };

  return (
    <div className="w-full bg-brand-50 min-h-screen pb-20 animate-fade-in font-display">
      <div className="text-center py-10 px-4">
        <h1 className="text-4xl md:text-6xl font-black text-orange-500 mb-4">AI Prompt Magic 🪄</h1>
        <p className="text-slate-500 font-bold text-xl italic">Tạo câu lệnh vẽ Sơ đồ tư duy 3D chuẩn nhất!</p>
      </div>

      <div className="max-w-4xl mx-auto px-4 space-y-10">
        <div className="bg-white rounded-[3rem] p-8 md:p-12 border-4 border-yellow-200 shadow-2xl">
            <h2 className="text-2xl font-black text-orange-500 mb-8 flex items-center gap-4"><span>👇</span> Chọn nguồn nội dung bài học:</h2>
            <div className="flex bg-slate-100 p-2 rounded-2xl mb-8">
                {[{ id: MindMapMode.IMAGE, label: 'Hình ảnh', icon: '📸' }, { id: MindMapMode.TEXT, label: 'Văn bản', icon: '📝' }, { id: MindMapMode.TOPIC, label: 'Chủ đề', icon: '💡' }].map(m => (
                    <button key={m.id} onClick={() => { setMode(m.id); setGeneratedPrompt(''); }} className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-black text-lg transition-all ${mode === m.id ? 'bg-orange-500 text-white shadow-xl scale-105' : 'text-slate-400 hover:bg-white'}`}>
                        <span>{m.icon}</span> <span>{m.label}</span>
                    </button>
                ))}
            </div>

            <div className="mb-10">
                {mode === MindMapMode.IMAGE ? (
                    <div className="border-4 border-dashed border-orange-200 bg-orange-50/30 rounded-3xl p-12 text-center relative group cursor-pointer">
                        <input type="file" accept="image/*" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" />
                        {selectedFiles.length === 0 ? (
                            <div className="text-orange-300"><div className="text-7xl mb-4">🖼️</div><span className="font-black text-2xl uppercase">Chọn ảnh bài học</span></div>
                        ) : (
                            <div className="flex flex-wrap gap-4 justify-center">{imagePreviews.map((src, i) => <img key={i} src={src} className="w-24 h-24 object-cover rounded-2xl border-4 border-white shadow-xl" alt="preview" />)}</div>
                        )}
                    </div>
                ) : (
                    <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Nhập nội dung bài học để AI soạn câu lệnh vẽ sơ đồ..." className="w-full h-56 p-6 rounded-3xl border-4 border-slate-100 focus:border-orange-400 outline-none font-sans text-xl font-bold text-slate-700 bg-slate-50" />
                )}
            </div>

            <button onClick={handleGenerate} disabled={isLoading} className="w-full py-7 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-3xl font-black text-3xl shadow-2xl transform transition-all active:scale-95 disabled:opacity-50 uppercase tracking-tighter">
                {isLoading ? '🤖 ĐANG SOẠN CÂU LỆNH...' : '🪄 TẠO CÂU LỆNH BUZAN 3D'}
            </button>
            {error && <p className="text-red-500 font-black mt-6 text-center text-xl animate-bounce">⚠️ {error}</p>}
        </div>

        {generatedPrompt && (
          <div className="bg-slate-900 rounded-[3.5rem] p-10 md:p-14 border-4 border-green-400 shadow-2xl animate-scale-in">
              <h2 className="text-2xl font-black text-green-400 mb-8 uppercase tracking-widest flex items-center gap-4"><span>✨</span> COPY VÀ DÁN VÀO AI VẼ:</h2>
              <div className="bg-white/5 backdrop-blur-md border-2 border-white/10 rounded-3xl p-8 mb-10 shadow-inner">
                  <p className="text-xl md:text-2xl font-black text-white leading-relaxed italic font-display">"{generatedPrompt}"</p>
              </div>
              <button onClick={copyToClipboard} className="w-full py-7 bg-green-500 text-white font-black text-3xl rounded-3xl hover:bg-green-400 transition-all flex items-center justify-center gap-6 shadow-xl border-b-[10px] border-green-700 active:border-b-0 uppercase">
                  <span>📋</span> COPY CÂU LỆNH 🚀
              </button>
              <p className="text-slate-500 text-center mt-8 font-black text-sm italic">"Câu lệnh này đã được AI tối ưu để vẽ ra sơ đồ tư duy 3D chuẩn nhất!"</p>
          </div>
        )}
      </div>
    </div>
  );
};

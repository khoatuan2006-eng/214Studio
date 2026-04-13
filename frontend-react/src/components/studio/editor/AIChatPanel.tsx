import React, { useState, useRef, useEffect } from 'react';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';
import { Send, Loader2, Sparkles, User, Bot } from 'lucide-react';

export const AIChatPanel: React.FC = () => {
    const { chatHistory, isAILoading, sendAIChatMessage } = useSceneGraphStore();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory, isAILoading]);

    const handleSend = () => {
        if (!input.trim() || isAILoading) return;
        sendAIChatMessage(input.trim());
        setInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-zinc-800 text-sm">
            <div className="p-3 border-b border-zinc-800 font-semibold text-zinc-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                AI Director
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatHistory.length === 0 && (
                    <div className="text-center text-zinc-500 mt-10">
                        <Sparkles className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                        <p>Ask the AI Director to build your scene.</p>
                        <p className="text-xs mt-2">Example: "Add the flower girl to the center of the screen"</p>
                    </div>
                )}

                {chatHistory.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        {msg.role === 'ai' && (
                            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                                <Bot className="w-5 h-5 text-purple-400" />
                            </div>
                        )}
                        
                        <div className={`
                            max-w-[80%] rounded-lg p-3 whitespace-pre-wrap
                            ${msg.role === 'user' 
                                ? 'bg-blue-600 text-white rounded-br-none' 
                                : msg.text.startsWith('Error:')
                                    ? 'bg-red-900/60 text-red-200 rounded-bl-none border border-red-500/30'
                                    : 'bg-zinc-800 text-zinc-200 rounded-bl-none'}
                        `}>
                            {msg.text}
                        </div>

                        {msg.role === 'user' && (
                            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                                <User className="w-5 h-5 text-blue-400" />
                            </div>
                        )}
                    </div>
                ))}

                {isAILoading && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                            <Bot className="w-5 h-5 text-purple-400" />
                        </div>
                        <div className="bg-zinc-800 text-zinc-200 rounded-lg rounded-bl-none p-3 px-4">
                            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-zinc-800 bg-zinc-900">
                <div className="relative flex items-end gap-2">
                    <textarea
                        className="w-full bg-zinc-800 text-zinc-100 rounded-lg pl-3 pr-10 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                        rows={2}
                        placeholder="Type a command..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isAILoading}
                        className="absolute right-2 bottom-2 p-1.5 text-zinc-400 hover:text-white disabled:opacity-50 transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

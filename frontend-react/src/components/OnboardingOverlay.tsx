import { useState, useEffect, useCallback } from 'react';
import { Palette, Video, MousePointer2, Play, Film, X, ChevronRight, Sparkles } from 'lucide-react';

const ONBOARDING_KEY = 'animestudio_onboarding_complete';

interface OnboardingStep {
    title: string;
    description: string;
    icon: React.ReactNode;
    tip?: string;
}

const STEPS: OnboardingStep[] = [
    {
        title: 'Chào mừng đến Anime Studio! 🎨',
        description: 'Đây là studio animation 2D chuyên nghiệp. Hãy cùng tìm hiểu flow cơ bản trong vài bước đơn giản.',
        icon: <Sparkles className="w-8 h-8" />,
        tip: 'Bạn có thể bỏ qua tour bất kỳ lúc nào.',
    },
    {
        title: 'Bước 1: Thêm Character',
        description: 'Nhấp vào tab "Base Characters" ở sidebar trái, sau đó click vào character để thêm vào canvas và timeline.',
        icon: <Palette className="w-8 h-8" />,
        tip: 'Mỗi character sẽ tạo một track riêng trên timeline.',
    },
    {
        title: 'Bước 2: Điều khiển Timeline',
        description: 'Dùng timeline ở phía dưới để kéo, cắt, và sắp xếp các action block. Nhấn Space để Play/Pause.',
        icon: <Play className="w-8 h-8" />,
        tip: 'Ctrl+C / Ctrl+V để copy/paste block. Arrow keys để nudge từng frame.',
    },
    {
        title: 'Bước 3: Chỉnh thuộc tính',
        description: 'Chọn character trên canvas → panel bên phải hiện thuộc tính (X, Y, Scale, Rotation, Opacity). Bật Auto-Keyframe để tự ghi nhận thay đổi.',
        icon: <MousePointer2 className="w-8 h-8" />,
        tip: 'Dùng chuột phải trên canvas để truy cập menu nhanh.',
    },
    {
        title: 'Bước 4: Xuất Video',
        description: 'Nhấn nút "Export MP4" ở góc trên canvas để render animation thành file video MP4. Xong!',
        icon: <Film className="w-8 h-8" />,
        tip: 'FFmpeg cần được cài trên server để export hoạt động.',
    },
];

export default function OnboardingOverlay() {
    const [currentStep, setCurrentStep] = useState(0);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const done = localStorage.getItem(ONBOARDING_KEY);
        if (!done) {
            setIsVisible(true);
        }
    }, []);

    const handleComplete = useCallback(() => {
        localStorage.setItem(ONBOARDING_KEY, 'true');
        setIsVisible(false);
    }, []);

    const handleNext = useCallback(() => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            handleComplete();
        }
    }, [currentStep, handleComplete]);

    const handlePrev = useCallback(() => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    }, [currentStep]);

    if (!isVisible) return null;

    const step = STEPS[currentStep];
    const isLastStep = currentStep === STEPS.length - 1;
    const progress = ((currentStep + 1) / STEPS.length) * 100;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            {/* Background decorative elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
            </div>

            <div className="relative w-[520px] max-w-[90vw] animate-fade-scale-in">
                {/* Card */}
                <div className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden">
                    {/* Progress bar */}
                    <div className="h-1 bg-neutral-800">
                        <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>

                    {/* Close button */}
                    <button
                        onClick={handleComplete}
                        className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors z-10"
                        title="Bỏ qua tour"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {/* Content */}
                    <div className="p-8 pt-6">
                        {/* Icon */}
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-5">
                            {step.icon}
                        </div>

                        <h2 className="text-xl font-bold text-white mb-3">{step.title}</h2>
                        <p className="text-neutral-300 text-sm leading-relaxed mb-4">{step.description}</p>

                        {step.tip && (
                            <div className="flex items-start gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 mb-6">
                                <Video className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                                <p className="text-xs text-indigo-300">{step.tip}</p>
                            </div>
                        )}

                        {/* Step indicators */}
                        <div className="flex items-center gap-2 mb-6">
                            {STEPS.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setCurrentStep(i)}
                                    className={`h-1.5 rounded-full transition-all duration-300 ${i === currentStep
                                            ? 'w-8 bg-indigo-500'
                                            : i < currentStep
                                                ? 'w-4 bg-indigo-500/50'
                                                : 'w-4 bg-neutral-600'
                                        }`}
                                />
                            ))}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between">
                            <button
                                onClick={handleComplete}
                                className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                            >
                                Bỏ qua tour
                            </button>
                            <div className="flex gap-2">
                                {currentStep > 0 && (
                                    <button
                                        onClick={handlePrev}
                                        className="px-4 py-2 text-sm font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
                                    >
                                        Quay lại
                                    </button>
                                )}
                                <button
                                    onClick={handleNext}
                                    className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-lg transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-1.5 active:scale-95"
                                >
                                    {isLastStep ? 'Bắt đầu sáng tạo!' : 'Tiếp tục'}
                                    {!isLastStep && <ChevronRight className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

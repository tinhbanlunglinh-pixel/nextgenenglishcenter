import React, { useState, useEffect } from 'react';
import { Assignment, Submission } from '../../types';
import { VocabularySection } from '../VocabularySection';
import { MegaChallenge } from '../MegaChallenge';
import { LessonCertificate } from '../LessonCertificate';
import { SubmissionSuccessModal } from './SubmissionSuccessModal';
import { StudentExamView } from './StudentExamView';
import { saveSubmission, getStudentSubmission, saveAssignment } from '../../services/assignmentService';
import { getCurrentUser } from '../../services/authService';
import { sendToGoogleSheets } from '../../services/googleSheetsService';
import { saveLessonRecord, generateRecordId } from '../../services/historyService';

interface StudentLessonViewProps {
  assignment: Assignment;
  studentName: string;
  studentClass: string;
  studentId?: string;
  onBack: () => void;
}

export const StudentLessonView: React.FC<StudentLessonViewProps> = ({
  assignment,
  studentName,
  studentClass,
  studentId,
  onBack
}) => {
  // If this assignment is a Preserved Exam, render StudentExamView directly!
  if (assignment.assignmentType === 'exam' || assignment.examData) {
    return (
      <StudentExamView
        assignment={assignment}
        studentName={studentName}
        studentClass={studentClass}
        studentId={studentId}
        onBack={onBack}
      />
    );
  }

  const [currentAssign, setCurrentAssign] = useState<Assignment>(assignment);

  useEffect(() => {
    setCurrentAssign(assignment);
  }, [assignment]);

  const existingSubmission = getStudentSubmission(currentAssign?.id || assignment?.id || '', studentName, studentId, studentClass);
  const [isSubmitted, setIsSubmitted] = useState(!!existingSubmission);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedScore, setSubmittedScore] = useState<number>(existingSubmission?.score || 0);

  const lesson = currentAssign?.lessonPlan || (assignment?.lessonPlan as any) || ({} as any);

  // Chuẩn 55 câu hỏi MegaChallenge (10 Quiz ABCD + 5 Bài đọc ABCD + 5 Cách đọc khác + 10 Sắp xếp + 10 Dịch nghĩa + 10 Đúng/Sai + 5 Luyện nghe)
  const computedTotal =
    (lesson?.practice?.megaTest?.multipleChoice?.length || 0) +
    (lesson?.practice?.megaTest?.readingMC?.length || 0) +
    (lesson?.practice?.megaTest?.pronunciation?.length || 0) +
    (lesson?.practice?.megaTest?.scramble?.length || 0) +
    (lesson?.practice?.megaTest?.vocabTranslation?.length || 0) +
    (lesson?.practice?.megaTest?.trueFalse?.length || 0) +
    (lesson?.practice?.listening?.length || 0) +
    (lesson?.practice?.megaTest?.fillBlank?.length || 0);

  const totalQuestions = computedTotal > 0 ? computedTotal : 55;
  const [submittedQuestions, setSubmittedQuestions] = useState<number>(existingSubmission?.totalQuestions || totalQuestions);

  const [submittedCorrect, setSubmittedCorrect] = useState<number>(() => {
    if (typeof existingSubmission?.totalCorrect === 'number' && existingSubmission.totalCorrect > 0) {
      return existingSubmission.totalCorrect;
    }
    if (existingSubmission?.score && existingSubmission.score > 0) {
      return Math.round((existingSubmission.score / 10) * (existingSubmission.totalQuestions || totalQuestions));
    }
    return 0;
  });

  const [megaScores, setMegaScores] = useState(
    existingSubmission?.skillScores || { mc: 0, scramble: 0, fill: 0, vocab: 0, tf: 0, listen: 0, readingMC: 0, pronunciation: 0 }
  );

  const isTeacher = typeof window !== 'undefined' && (
    localStorage.getItem('nextgen_user_role') === 'teacher' ||
    getCurrentUser()?.role === 'teacher'
  );

  const handleUpdateMega = (newMega: any) => {
    if (!currentAssign?.lessonPlan) return;
    const updated: Assignment = {
      ...currentAssign,
      lessonPlan: {
        ...currentAssign.lessonPlan,
        practice: {
          ...currentAssign.lessonPlan.practice,
          megaTest: newMega
        }
      }
    };
    setCurrentAssign(updated);
    saveAssignment(updated);
  };

  const handleUpdateListening = (newListening: any) => {
    if (!currentAssign?.lessonPlan) return;
    const updated: Assignment = {
      ...currentAssign,
      lessonPlan: {
        ...currentAssign.lessonPlan,
        practice: {
          ...currentAssign.lessonPlan.practice,
          listening: newListening
        }
      }
    };
    setCurrentAssign(updated);
    saveAssignment(updated);
  };

  const [showCertificate, setShowCertificate] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Không cho MegaChallenge reset điểm về 0 khi học sinh đã nộp bài rồi
  const handleScoresUpdate = (scores: any) => {
    if (!isSubmitted && !existingSubmission) {
      setMegaScores(scores);
    }
  };

  const totalCorrectCount =
    (megaScores.mc || 0) +
    (megaScores.readingMC || 0) +
    (megaScores.pronunciation || 0) +
    (megaScores.scramble || 0) +
    (megaScores.vocab || 0) +
    (megaScores.tf || 0) +
    (megaScores.listen || 0) +
    (megaScores.fill || 0);

  function calculateScore() {
    const total = totalQuestions || 55;
    // Chấm điểm theo thang điểm 10 chuẩn trên tổng số 55 câu hỏi
    const raw = (totalCorrectCount / total) * 10;
    return Math.min(10, Math.max(0, Math.round(raw * 10) / 10));
  }

  const currentScore = isSubmitted ? submittedScore : calculateScore();

  // Đảm bảo số câu đúng KHÔNG BAO GIỜ bị 0 nếu điểm > 0
  const effectiveTotalCorrect = isSubmitted
    ? (submittedCorrect > 0
        ? submittedCorrect
        : (existingSubmission?.totalCorrect || (currentScore > 0 ? Math.round((currentScore / 10) * (isSubmitted ? submittedQuestions : totalQuestions)) : 0)))
    : totalCorrectCount;

  function getEvaluation(score: number) {
    const s = score || 0;
    if (s >= 9) return { text: "XUẤT SẮC", emoji: "🏆", level: "EXCELLENT", praise: "Con là một ngôi sao sáng nhất Nextgen English!" };
    if (s >= 7) return { text: "KHÁ GIỎI", emoji: "🌟", level: "GREAT JOB", praise: "Con làm bài rất tuyệt vời, tiếp tục phát huy nhé!" };
    if (s >= 5) return { text: "CỐ GẮNG", emoji: "👍", level: "GOOD EFFORT", praise: "Con đã nỗ lực rất nhiều, Nextgen English rất tự hào về con!" };
    return { text: "CẦN NỖ LỰC", emoji: "💪", level: "KEEP IT UP", praise: "Đừng nản lòng con nhé, bài sau mình làm tốt hơn nào!" };
  }

  const evaluation = getEvaluation(currentScore);

  const handleSubmitAssignment = async () => {
    if (isSubmitting) return;
    if (!studentName.trim() || !studentClass.trim()) {
      alert('Vui lòng nhập đầy đủ tên và lớp để nộp bài nhé!');
      return;
    }

    if (isSubmitted || existingSubmission) {
      alert('Con đã nộp bài tập này rồi! Link cô giao mỗi học sinh chỉ được làm 1 lần duy nhất.');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalScore = calculateScore();
      const finalQuestions = totalQuestions || 55;
      const finalCorrect = totalCorrectCount > 0
        ? totalCorrectCount
        : (finalScore > 0 ? Math.round((finalScore / 10) * finalQuestions) : 0);
      const finalEval = getEvaluation(finalScore);

      const submission: Submission = {
        id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        studentId: studentId || existingSubmission?.studentId,
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        topic: assignment.topic,
        studentName: studentName.trim(),
        studentClass: studentClass.trim(),
        submittedAt: new Date().toISOString(),
        score: finalScore,
        totalCorrect: finalCorrect,
        totalQuestions: finalQuestions,
        skillScores: { ...megaScores } as any,
        evaluation: finalEval
      };

      setSubmittedScore(finalScore);
      setSubmittedCorrect(finalCorrect);
      setSubmittedQuestions(finalQuestions);
      setIsSubmitted(true);
      setShowSuccessModal(true);

      // Save to assignment service (real-time sync to teacher dashboard)
      const saveRes = await saveSubmission(submission);
      if (saveRes && !saveRes.success && saveRes.error) {
        console.warn('saveSubmission status:', saveRes.error);
      }

      // Save to local history
      saveLessonRecord({
        id: generateRecordId(),
        date: new Date().toISOString(),
        topic: assignment.topic,
        score: finalScore,
        totalCorrect: finalCorrect,
        totalQuestions: finalQuestions,
        skillScores: { ...megaScores },
        studentName: studentName.trim()
      });

      // Send to Google Sheets (background)
      sendToGoogleSheets({
        studentName: studentName.trim(),
        studentClass: studentClass.trim(),
        topic: assignment.topic,
        score: finalScore,
        totalCorrect: finalCorrect,
        totalQuestions: finalQuestions
      });
    } catch (err) {
      console.error('Error saving submission:', err);
      setIsSubmitted(true);
      setShowSuccessModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans pb-16">
      {/* Header Điều Hướng */}
      <div className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-md border border-brand-100">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-all"
        >
          <span>⬅️</span> Quay lại danh sách bài tập
        </button>

        <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-brand-700">
          <span>Học sinh:</span>
          <span className="px-3 py-1 bg-brand-50 rounded-lg text-brand-900 font-black">
            {studentName} ({studentClass})
          </span>
        </div>
      </div>

      {/* Locked Notice if already submitted */}
      {(existingSubmission || isSubmitted) && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-950 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔒</span>
            <div>
              <h4 className="font-black text-sm sm:text-base text-amber-900">
                BÀI HỌC ĐÃ HOÀN THÀNH - KHÓA LÀM LẠI
              </h4>
              <p className="text-xs sm:text-sm text-amber-800 mt-0.5">
                Link cô giao mỗi học sinh chỉ được nộp bài <strong>1 lần duy nhất</strong>. Con đã nộp bài thành công với điểm số: <strong className="text-emerald-700">{(existingSubmission?.score ?? submittedScore).toFixed(1)}/10 điểm</strong>. Con có thể xem lại bài học và phần ôn luyện bên dưới!
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <span className="px-3 py-1 bg-amber-200 text-amber-950 rounded-full font-black text-xs">
              👀 Chế độ xem lại
            </span>
          </div>
        </div>
      )}

      {/* Thông tin bài học do giáo viên giao */}
      <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl border-4 border-brand-100 text-center space-y-4 relative overflow-hidden">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-brand-50 rounded-full text-xs font-black text-brand-700 uppercase tracking-widest">
          <span>📖</span> BÀI HỌC NEXTGEN GIAO
        </div>

        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-brand-900 uppercase font-display leading-tight">
          {assignment.title}
        </h1>

        {assignment.teacherNote && (
          <div className="max-w-2xl mx-auto p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium flex items-center gap-3 text-left">
            <span className="text-2xl shrink-0">👨‍🏫</span>
            <div>
              <p className="font-bold text-xs uppercase tracking-wider text-amber-800">Lời dặn của Giáo viên:</p>
              <p className="mt-0.5 italic">"{assignment.teacherNote}"</p>
            </div>
          </div>
        )}

        {isSubmitted && (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 border border-emerald-300 rounded-full text-emerald-800 font-bold text-sm">
            <span>✅</span> Con đã hoàn thành và nộp bài này với điểm số: <strong>{submittedScore.toFixed(1)}/10</strong>!
          </div>
        )}
      </div>

      {/* PHẦN 1: TỪ VỰNG CHUẨN GLOBAL SUCCESS (Đồng nhất 100% với bài cô soạn) */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl shadow-xl border border-brand-100">
        <VocabularySection items={lesson.vocabulary || []} />
      </div>

      {/* PHẦN 2: NGỮ PHÁP QUAN TRỌNG */}
      {lesson.grammar && (
        <div className="bg-highlight-400 p-4 sm:p-6 rounded-3xl shadow-xl border-4 border-white">
          <h2 className="text-base sm:text-xl font-black text-brand-900 uppercase tracking-tight mb-3 flex items-center gap-2">
            <span className="text-2xl">✨</span> Ngữ Pháp Quan Trọng
          </h2>
          <div className="bg-white/95 p-4 sm:p-6 rounded-2xl shadow-md space-y-3">
            <h3 className="text-lg sm:text-xl font-black text-brand-700">{lesson.grammar.topic}</h3>
            <p className="text-sm sm:text-base text-slate-700 leading-relaxed border-l-4 border-brand-500 pl-3">
              {lesson.grammar.explanation}
            </p>
            {lesson.grammar.examples && lesson.grammar.examples.length > 0 && (
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-brand-600 uppercase">Ví dụ minh họa:</h4>
                <div className="grid gap-2">
                  {lesson.grammar.examples.map((ex, i) => (
                    <div key={i} className="bg-brand-50 p-3 rounded-xl border border-brand-100 flex items-center gap-3">
                      <span className="text-lg">💎</span>
                      <p className="text-sm text-slate-700 italic font-medium">"{ex}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PHẦN 3: SIÊU THỬ THÁCH BÀI TẬP MEGA CHALLENGE (55 CÂU HỎI) */}
      {lesson?.practice?.megaTest && (
        <div className="space-y-4">
          <MegaChallenge
            megaData={lesson.practice.megaTest}
            listeningData={lesson.practice.listening}
            onScoresUpdate={handleScoresUpdate}
            isTeacher={isTeacher}
            lessonContext={{
              grade: currentAssign?.grade || assignment?.grade || 5,
              topic: lesson?.topic || assignment?.topic || '',
              grammarTopic: lesson?.grammar?.topic,
              grammarStructure: lesson?.grammar?.structure,
              vocabulary: (lesson?.vocabulary || []).map((v: any) => v?.word || v?.term || '').filter(Boolean),
            }}
            onUpdateMegaData={handleUpdateMega}
            onUpdateListeningData={handleUpdateListening}
          />
        </div>
      )}

      {/* PHẦN 4: TỔNG KẾT VÀ NỘP BÀI (THANG ĐIỂM 10 CHUẨN) */}
      <div className="bg-white rounded-3xl p-8 shadow-2xl border-4 border-brand-100 text-center space-y-6">
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Điểm Số Của Con</p>
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-black text-brand-600 leading-none">{currentScore.toFixed(1)}</span>
            <span className="text-2xl font-bold text-slate-300">/10</span>
          </div>
          <div className="text-sm font-semibold text-brand-600 bg-brand-50 px-4 py-1.5 rounded-full border border-brand-200">
            Số câu đúng: <span className="font-black text-brand-800">{effectiveTotalCorrect}/{isSubmitted ? submittedQuestions : totalQuestions}</span>
          </div>
          <div className={`mt-2 px-6 py-2 rounded-full font-black text-base shadow-md ${
            currentScore >= 5 ? 'bg-brand-500 text-white' : 'bg-orange-500 text-white'
          }`}>
            {evaluation?.emoji || '⭐'} {evaluation?.text || 'Hoàn thành'}
          </div>
        </div>

        {!isSubmitted ? (
          <div className="max-w-md mx-auto space-y-3">
            <button
              onClick={handleSubmitAssignment}
              disabled={isSubmitting}
              className={`w-full py-4 text-white rounded-2xl font-black text-xl shadow-xl transition-all transform active:scale-98 flex items-center justify-center gap-2 ${
                isSubmitting ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin inline-block">⏳</span> ĐANG NỘP BÀI LÊN HỆ THỐNG...
                </>
              ) : (
                <>
                  <span>🚀</span> NỘP BÀI TẬP CHO GIÁO VIÊN
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="max-w-md mx-auto space-y-3">
            <div className="p-4 bg-emerald-50 rounded-2xl border-2 border-emerald-300 text-emerald-900 text-sm space-y-1 text-center">
              <div className="flex items-center justify-center gap-2 font-black text-base text-emerald-800">
                <span>🎉</span> NỘP BÀI THÀNH CÔNG!
              </div>
              <p className="font-semibold text-emerald-700 text-xs sm:text-sm">
                Bài làm của con đã được lưu an toàn vào hệ thống Nextgen English.
              </p>
            </div>

            <button
              onClick={() => setShowSuccessModal(true)}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-base shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>🎉</span> Xem Chi Tiết Kết Quả Nộp Bài
            </button>

            <button
              onClick={() => setShowCertificate(true)}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl font-bold text-base shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>📜</span> Xem Chứng Nhận Vinh Danh
            </button>

            <button
              onClick={onBack}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-sm transition-all cursor-pointer"
            >
              Quay lại danh sách bài tập
            </button>
          </div>
        )}
      </div>

      {/* Submission Success Modal */}
      {showSuccessModal && (
        <SubmissionSuccessModal
          studentName={studentName}
          studentClass={studentClass}
          assignmentTitle={assignment.title || assignment.topic}
          score={currentScore}
          totalCorrect={effectiveTotalCorrect}
          totalQuestions={isSubmitted ? submittedQuestions : totalQuestions}
          submittedAt={existingSubmission?.submittedAt || new Date().toISOString()}
          evaluation={evaluation}
          onViewCertificate={() => {
            setShowSuccessModal(false);
            setShowCertificate(true);
          }}
          onBackToList={onBack}
          onClose={() => setShowSuccessModal(false)}
        />
      )}

      {/* Certificate Modal */}
      {showCertificate && (
        <LessonCertificate
          studentName={studentName}
          topic={assignment.topic}
          score={currentScore}
          totalCorrect={effectiveTotalCorrect}
          totalQuestions={isSubmitted ? submittedQuestions : totalQuestions}
          evaluation={evaluation}
          onClose={() => setShowCertificate(false)}
        />
      )}
    </div>
  );
};

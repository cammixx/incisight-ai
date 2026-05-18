import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import GradientBackground from '../components/GradientBackground'


const GOALS = ['Hydration', 'Anti-aging', 'Brightening', 'Acne control', 'Soothing', 'SPF protection']
const SKIN_TYPES = ['Oily', 'Dry', 'Combination', 'Sensitive']
const AGE_RANGES = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55+']
const COMMON_AVOID = ['Fragrance', 'Alcohol', 'Parabens', 'Sulfates', 'Essential Oils', 'Formaldehyde']

interface Answers {
  goals: string[]
  skinType: string
  age: string
  avoidList: string[]
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [answers, setAnswers] = useState<Answers>({ goals: [], skinType: '', age: '', avoidList: [] })
  const [avoidInput, setAvoidInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const totalSteps = 4

  function next() {
    if (step < totalSteps - 1) {
      setDirection('forward')
      setStep(step + 1)
    } else {
      navigate('/auth', { state: { onboarding: answers } })
    }
  }

  function back() {
    if (step > 0) {
      setDirection('back')
      setStep(step - 1)
    } else {
      navigate('/')
    }
  }

  function selectAndNext(key: 'skinType' | 'age', value: string) {
    setAnswers({ ...answers, [key]: value })
    setTimeout(() => {
      setDirection('forward')
      if (step < totalSteps - 1) {
        setStep(step + 1)
      } else {
        navigate('/auth', { state: { onboarding: { ...answers, [key]: value } } })
      }
    }, 300)
  }

  function toggleGoal(goal: string) {
    const goals = answers.goals.includes(goal)
      ? answers.goals.filter(g => g !== goal)
      : [...answers.goals, goal]
    setAnswers({ ...answers, goals })
  }

  function addAvoidItem() {
    const trimmed = avoidInput.trim()
    if (!trimmed || answers.avoidList.includes(trimmed)) return
    setAnswers({ ...answers, avoidList: [...answers.avoidList, trimmed] })
    setAvoidInput('')
  }

  function removeAvoidItem(item: string) {
    setAnswers({ ...answers, avoidList: answers.avoidList.filter(i => i !== item) })
  }

  const progress = ((step + 1) / totalSteps) * 100

  return (
    <div className="min-h-screen flex flex-col">
      {submitting && (
        <div className="fixed inset-0 z-[200] bg-rose-50 flex items-center justify-center">
          <GradientBackground animate={true} showDecor={false} />
          <div className="relative z-10 onboarding-loader" />
        </div>
      )}
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <button onClick={back} className="text-gray-400 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <span className="text-sm font-medium text-gray-400">{step + 1} of {totalSteps}</span>
          <div className="w-10" />
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-rose-100">
          <div
            className="h-full bg-rose-400 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question area */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-6">
        <div
          key={step}
          className={`w-full max-w-lg ${
            direction === 'forward' ? 'animate-slide-in-right' : 'animate-slide-in-left'
          }`}
        >
          {step === 0 && (
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                What are your skin goals?
              </h2>
              <p className="text-sm text-gray-400 mb-8">Select all that apply</p>
              <div className="grid grid-cols-2 gap-3">
                {GOALS.map(goal => (
                  <button
                    key={goal}
                    onClick={() => toggleGoal(goal)}
                    className={`px-6 py-4 rounded-2xl text-base font-medium border-2 transition-all duration-200 ${
                      answers.goals.includes(goal)
                        ? 'bg-rose-400 text-white border-rose-400 scale-[1.02]'
                        : 'bg-white text-gray-700 border-rose-100 hover:shadow-md'
                    }`}
                  >
                    {goal}
                  </button>
                ))}
              </div>
              <button
                onClick={next}
                disabled={answers.goals.length === 0}
                className="mt-8 inline-flex items-center gap-2 px-8 py-3 bg-rose-400 disabled:opacity-40 text-white font-semibold rounded-full transition-all shadow-lg shadow-rose-200"
              >
                Next
                <ArrowRight size={18} />
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="text-center">
              <p className="text-sm font-medium text-rose-400 uppercase tracking-wider mb-3">Step 2</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10">
                What's your skin type?
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {SKIN_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => selectAndNext('skinType', type)}
                    className={`px-6 py-4 rounded-2xl text-base font-medium border-2 transition-all duration-200 ${
                      answers.skinType === type
                        ? 'bg-rose-400 text-white border-rose-400 scale-[1.02]'
                        : 'bg-white text-gray-700 border-rose-100 hover:shadow-md'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="text-center">
              <p className="text-sm font-medium text-rose-400 uppercase tracking-wider mb-3">Step 3</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10">
                How old are you?
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {AGE_RANGES.map(age => (
                  <button
                    key={age}
                    onClick={() => selectAndNext('age', age)}
                    className={`px-4 py-4 rounded-2xl text-base font-medium border-2 transition-all duration-200 ${
                      answers.age === age
                        ? 'bg-rose-400 text-white border-rose-400 scale-[1.02]'
                        : 'bg-white text-gray-700 border-rose-100 hover:shadow-md'
                    }`}
                  >
                    {age}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <p className="text-sm font-medium text-rose-400 uppercase tracking-wider mb-3">Last step</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Any ingredients you'd like to avoid?
              </h2>
              <p className="text-sm text-gray-400 mb-6">Select common irritants or type your own</p>
              <div className="grid grid-cols-3 gap-3 mb-6 max-w-sm mx-auto">
                {COMMON_AVOID.map(item => (
                  <button
                    key={item}
                    onClick={() => {
                      if (answers.avoidList.includes(item)) {
                        setAnswers({ ...answers, avoidList: answers.avoidList.filter(i => i !== item) })
                      } else {
                        setAnswers({ ...answers, avoidList: [...answers.avoidList, item] })
                      }
                    }}
                    className={`px-4 py-3 rounded-2xl text-sm font-medium border-2 transition-all duration-200 ${
                      answers.avoidList.includes(item)
                        ? 'bg-rose-400 text-white border-rose-400 scale-[1.02]'
                        : 'bg-white text-gray-700 border-rose-100 hover:shadow-md'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mb-4 max-w-sm mx-auto">
                <input
                  value={avoidInput}
                  onChange={e => setAvoidInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addAvoidItem()}
                  placeholder="e.g. fragrance, paraben"
                  className="flex-1 px-4 py-3 rounded-xl border-2 border-rose-100 text-sm focus:outline-none focus:border-rose-300 transition-colors"
                />
                <button
                  onClick={addAvoidItem}
                  className="px-4 py-3 bg-rose-900 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Add
                </button>
              </div>
              {answers.avoidList.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 mb-6">
                  {answers.avoidList.map(item => (
                    <span key={item} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-500 text-sm rounded-full border border-rose-200">
                      {item}
                      <button onClick={() => removeAvoidItem(item)} className="">
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-sm font-light text-gray-500 mb-8">*You can skip this or add more later in your profile.</p>
              <button
                onClick={() => { setSubmitting(true); setTimeout(() => next(), 2500) }}
                disabled={submitting}
                className="inline-flex items-center justify-center px-8 py-4 bg-rose-400 disabled:opacity-50 text-white text-lg font-semibold rounded-full transition-all shadow-lg shadow-rose-200 hover:shadow-xl hover:shadow-rose-300 hover:-translate-y-0.5"
              >
                Get started
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

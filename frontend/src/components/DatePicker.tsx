import { useRef, useEffect } from 'react'
import flatpickr from 'flatpickr'
import { Indonesian } from 'flatpickr/dist/l10n/id.js'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
}

export default function DatePicker({ value, onChange, placeholder, disabled, required, className }: DatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const fpRef = useRef<flatpickr.Instance | null>(null)

  useEffect(() => {
    if (!inputRef.current) return
    fpRef.current = flatpickr(inputRef.current, {
      dateFormat: 'd/m/Y',
      locale: Indonesian,
      onChange: (selectedDates) => {
        if (selectedDates[0]) {
          const y = selectedDates[0].getFullYear()
          const m = String(selectedDates[0].getMonth() + 1).padStart(2, '0')
          const d = String(selectedDates[0].getDate()).padStart(2, '0')
          onChange(`${y}-${m}-${d}`)
        } else {
          onChange('')
        }
      },
    })
    return () => { fpRef.current?.destroy() }
  }, [])

  useEffect(() => {
    if (fpRef.current) {
      if (value) {
        fpRef.current.setDate(new Date(value + 'T00:00:00'), false)
      } else {
        fpRef.current.setDate('', false)
      }
    }
  }, [value])

  return (
    <input
      ref={inputRef}
      type="text"
      className={className}
      placeholder={placeholder || 'DD/MM/YYYY'}
      disabled={disabled}
      required={required}
    />
  )
}

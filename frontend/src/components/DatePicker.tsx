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
  // flatpickr is created once, so its `onChange` would keep calling the first
  // render's prop — every caller spreads that closure's state object
  // (`setFormData({ ...formData, date: v })`), which silently reverted all other
  // fields to their initial values when the date was changed (B49).
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  useEffect(() => {
    if (!inputRef.current) return
    // V63: flatpickr's `isMobile` mode swaps the visible field for a second, hidden-behind
    // native <input type="date"> (US format on an en-US device). The visible field stays
    // `readonly`, tapping it opens nothing, and the native field's change event is swallowed —
    // so on a phone the date could not be edited at all. Keep one field and the real calendar.
    fpRef.current = flatpickr(inputRef.current, {
      dateFormat: 'd/m/Y',
      locale: Indonesian,
      disableMobile: true,
      allowInput: true,
      onChange: (selectedDates) => {
        if (selectedDates[0]) {
          const y = selectedDates[0].getFullYear()
          const m = String(selectedDates[0].getMonth() + 1).padStart(2, '0')
          const d = String(selectedDates[0].getDate()).padStart(2, '0')
          onChangeRef.current(`${y}-${m}-${d}`)
        } else {
          onChangeRef.current('')
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

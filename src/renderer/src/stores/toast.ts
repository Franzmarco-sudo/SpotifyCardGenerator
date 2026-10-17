import { create } from 'zustand'

interface ToastState {
  message: string
  success: boolean
  visible: boolean
  show: (message: string, success?: boolean) => void
}

let timer: ReturnType<typeof setTimeout> | undefined

export const useToast = create<ToastState>((set) => ({
  message: '',
  success: true,
  visible: false,
  show: (message, success = true) => {
    clearTimeout(timer)
    set({ message, success, visible: true })
    timer = setTimeout(() => set({ visible: false }), 3000)
  }
}))

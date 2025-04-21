'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Locked() {
  const [key, setKey] = useState('')
  const router = useRouter()

  const handleSubmit = () => {
    router.push(`/?key=${key}`)
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-white">
      <h1 className="text-3xl mb-4"> Locked</h1>
      <input
        type="password"
        className="p-2 border border-gray-300 text-black"
        placeholder="Enter Access Key"
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <button className="mt-4 px-4 py-2 bg-blue-600" onClick={handleSubmit}>
        Unlock
      </button>
    </div>
  )
}

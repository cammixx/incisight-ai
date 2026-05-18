interface PageHeaderProps {
  title: string
  maxWidth?: string
  children?: React.ReactNode
}

export default function PageHeader({ title, maxWidth = 'max-w-lg', children }: PageHeaderProps) {
  return (
    <header className={`px-4 py-4 flex items-center ${maxWidth} mx-auto mt-20 justify-between`}>
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </header>
  )
}

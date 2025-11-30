import { Package, BarChart3, Store } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description: string
  icon?: 'package' | 'chart' | 'store'
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ title, description, icon = 'package', action }: EmptyStateProps) {
  const IconComponent = {
    package: Package,
    chart: BarChart3,
    store: Store
  }[icon]

  return (
    <div className="text-center py-12">
      <div className="mx-auto h-12 w-12 text-gray-400">
        <IconComponent className="h-full w-full" />
      </div>
      <h3 className="mt-2 text-sm font-medium text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
      {action && (
        <div className="mt-6">
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {action.label}
          </button>
        </div>
      )}
    </div>
  )
}

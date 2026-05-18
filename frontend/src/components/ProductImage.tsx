import productPlaceholder from '../assets/product-placeholder.svg'

interface ProductImageProps {
  src?: string | null
  alt: string
  className?: string
}

export default function ProductImage({ src, alt, className = 'w-full h-full object-contain mix-blend-multiply' }: ProductImageProps) {
  return (
    <img
      src={src ?? productPlaceholder}
      alt={alt}
      className={className}
      onError={(e) => { (e.target as HTMLImageElement).src = productPlaceholder }}
    />
  )
}

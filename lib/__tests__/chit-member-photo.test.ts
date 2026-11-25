import { describe, it, expect } from 'vitest'
import {
  photoProblem, photoExtension, photoPath, initialsOf, MAX_PHOTO_BYTES,
} from '@/lib/chit/memberPhoto'

describe('what may be uploaded as a photo', () => {
  it('takes what a phone camera produces', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
      expect({ type, problem: photoProblem({ type, size: 900_000 }) })
        .toEqual({ type, problem: null })
    }
  })

  it('refuses something that is not a photo', () => {
    expect(photoProblem({ type: 'application/pdf', size: 1000 })).toContain('JPG, PNG or HEIC')
    expect(photoProblem({ type: '', size: 1000 })).toContain('no type')
  })

  // A phone photograph is a megabyte or two. Beyond three, the member's
  // connection pays for somebody uploading something else.
  it('refuses an empty file and an enormous one', () => {
    expect(photoProblem({ type: 'image/jpeg', size: 0 })).toContain('empty')
    expect(photoProblem({ type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 })).toContain('under 3 MB')
  })
})

describe('where it is stored', () => {
  // One file per member, replaced rather than piled up: a member who changes
  // their photo four times should not leave four files behind.
  it('is one path per member', () => {
    expect(photoPath('u1', 'm1', 'image/jpeg')).toBe('u1/members/m1.jpg')
    expect(photoPath('u1', 'm1', 'image/png')).toBe('u1/members/m1.png')
  })

  it('keeps the extension honest', () => {
    expect(photoExtension('image/webp')).toBe('webp')
    expect(photoExtension('image/heic')).toBe('heic')
    expect(photoExtension('nonsense')).toBe('jpg')
  })
})

describe('the letters shown without a photo', () => {
  it('takes the first and last names', () => {
    expect(initialsOf('Vishnu Prasanth')).toBe('VP')
    expect(initialsOf('ravi kumar sharma')).toBe('RS')
  })

  it('gives one letter for one word, rather than a nonsense pair', () => {
    expect(initialsOf('Ravi')).toBe('R')
  })

  it('has something to show for nothing at all', () => {
    expect(initialsOf('')).toBe('?')
    expect(initialsOf('   ')).toBe('?')
  })
})

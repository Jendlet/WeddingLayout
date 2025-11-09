import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Guest = {
  id: string
  name: string
  details?: string
}

type Table = {
  id: string
  seatCount: number
  position: { x: number; y: number }
}

type LayoutSnapshot = {
  version: 1
  guests: Guest[]
  tables: Table[]
  assignments: Record<string, string | null>
  unassigned: string[]
}

const seatKey = (tableId: string, seatIndex: number) => `${tableId}:${seatIndex}`

const buildEmptyAssignments = (tables: Table[]) => {
  const map: Record<string, string | null> = {}
  tables.forEach((table) => {
    for (let seatIndex = 0; seatIndex < table.seatCount; seatIndex += 1) {
      map[seatKey(table.id, seatIndex)] = null
    }
  })
  return map
}

const DEFAULT_GUESTS: Guest[] = [
  { id: 'guest-1', name: 'Alice' },
  { id: 'guest-2', name: 'Bob' },
  { id: 'guest-3', name: 'Charlie' },
  { id: 'guest-4', name: 'Diana' },
  { id: 'guest-5', name: 'Elliot' },
  { id: 'guest-6', name: 'Fiona' },
  { id: 'guest-7', name: 'George' },
  { id: 'guest-8', name: 'Hannah' },
  { id: 'guest-9', name: 'Isaac' },
  { id: 'guest-10', name: 'Jasmine' },
  { id: 'guest-11', name: 'Karl' },
  { id: 'guest-12', name: 'Luna' },
]

const DEFAULT_TABLES: Table[] = [
  {
    id: 'table-1',
    seatCount: 8,
    position: { x: 120, y: 100 },
  },
  {
    id: 'table-2',
    seatCount: 8,
    position: { x: 420, y: 300 },
  },
]

const SEAT_OPTIONS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24] as const
const STORAGE_KEY = 'wedding-layout-state-v1'

type LayoutState = {
  guests: Guest[]
  tables: Table[]
  assignments: Record<string, string | null>
  pool: string[]
}

const normalizeLayoutPayload = (payload: unknown): LayoutState | null => {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !Array.isArray((payload as { tables?: unknown }).tables) ||
    !Array.isArray((payload as { guests?: unknown }).guests) ||
    typeof (payload as { assignments?: unknown }).assignments !== 'object'
  ) {
    return null
  }

  const rawTables = (payload as { tables: unknown[] }).tables
  const rawGuests = (payload as { guests: unknown[] }).guests
  const rawAssignments = (payload as { assignments: Record<string, unknown> })
    .assignments
  const rawUnassigned = (payload as { unassigned?: unknown[] }).unassigned

  const cleanedTables: Table[] = rawTables.reduce<Table[]>(
    (accumulator, item) => {
      if (typeof item !== 'object' || item === null) {
        return accumulator
      }
      const record = item as Record<string, unknown>
      const id = typeof record.id === 'string' ? record.id : ''
      const seatCountValue = record.seatCount
      const seatCount =
        typeof seatCountValue === 'number'
          ? seatCountValue
          : typeof seatCountValue === 'string'
            ? Number(seatCountValue)
            : NaN
      const positionRecord =
        typeof record.position === 'object' && record.position !== null
          ? (record.position as Record<string, unknown>)
          : null
      const rawX = positionRecord?.x
      const rawY = positionRecord?.y
      const x =
        typeof rawX === 'number'
          ? rawX
          : typeof rawX === 'string'
            ? Number(rawX)
            : 0
      const y =
        typeof rawY === 'number'
          ? rawY
          : typeof rawY === 'string'
            ? Number(rawY)
            : 0

      if (!id || Number.isNaN(seatCount)) {
        return accumulator
      }

      accumulator.push({
        id,
        seatCount: Math.max(1, Math.floor(seatCount)),
        position: {
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
        },
      })
      return accumulator
    },
    [],
  )

  const cleanedGuests: Guest[] = rawGuests.reduce<Guest[]>(
    (accumulator, item) => {
      if (typeof item !== 'object' || item === null) {
        return accumulator
      }
      const record = item as Record<string, unknown>
      const id = typeof record.id === 'string' ? record.id : ''
      const name = typeof record.name === 'string' ? record.name : ''
      if (!id || !name) {
        return accumulator
      }
      accumulator.push({
        id,
        name,
        details:
          typeof record.details === 'string' ? record.details : undefined,
      })
      return accumulator
    },
    [],
  )

  if (!cleanedGuests.length) {
    return null
  }

  const guestIds = new Set(cleanedGuests.map((guest) => guest.id))
  const normalizedAssignments = buildEmptyAssignments(cleanedTables)
  Object.entries(rawAssignments).forEach(([key, value]) => {
    if (!(key in normalizedAssignments)) {
      return
    }
    if (typeof value === 'string' && guestIds.has(value)) {
      normalizedAssignments[key] = value
    } else {
      normalizedAssignments[key] = null
    }
  })

  const assignedSet = new Set(
    Object.values(normalizedAssignments).filter(
      (guestId): guestId is string =>
        typeof guestId === 'string' && guestIds.has(guestId),
    ),
  )

  const poolSnapshot = Array.isArray(rawUnassigned)
    ? rawUnassigned.filter((id): id is string => typeof id === 'string')
    : []
  const pool: string[] = []
  const seen = new Set<string>()

  poolSnapshot.forEach((guestId) => {
    if (!assignedSet.has(guestId) && guestIds.has(guestId) && !seen.has(guestId)) {
      pool.push(guestId)
      seen.add(guestId)
    }
  })

  cleanedGuests.forEach((guest) => {
    if (!assignedSet.has(guest.id) && !seen.has(guest.id)) {
      pool.push(guest.id)
      seen.add(guest.id)
    }
  })

  return {
    guests: cleanedGuests,
    tables: cleanedTables,
    assignments: normalizedAssignments,
    pool,
  }
}

const loadInitialState = (): LayoutState | null => {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return null
    }
    const parsed = JSON.parse(stored)
    return normalizeLayoutPayload(parsed)
  } catch (error) {
    console.error('Unable to load saved layout', error)
    return null
  }
}

function App() {
  const initialState = loadInitialState()
  const initialGuests = initialState?.guests ?? DEFAULT_GUESTS
  const initialTables = initialState?.tables ?? DEFAULT_TABLES
  const initialAssignments =
    initialState?.assignments ?? buildEmptyAssignments(initialTables)
  const initialPool =
    initialState?.pool ?? initialGuests.map((guest) => guest.id)

  const [guests, setGuests] = useState<Guest[]>(initialGuests)
  const [tables, setTables] = useState<Table[]>(initialTables)
  const [assignments, setAssignments] =
    useState<Record<string, string | null>>(initialAssignments)
  const [pool, setPool] = useState<string[]>(initialPool)
  const [selectedSeatKeys, setSelectedSeatKeys] = useState<string[]>([])
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
  const [menuState, setMenuState] = useState<{
    tableId: string
    x: number
    y: number
  } | null>(null)
  const draggingTableRef = useRef<{
    tableId: string
    originX: number
    originY: number
    pointerX: number
    pointerY: number
  } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const guestMap = useMemo(() => {
    const map = new Map<string, Guest>()
    guests.forEach((guest) => map.set(guest.id, guest))
    return map
  }, [guests])

  const applyLayoutState = useCallback(
    (state: LayoutState) => {
      setGuests(state.guests)
      setTables(state.tables)
      setAssignments(state.assignments)
      setPool(state.pool)
      setMenuState(null)
      setSelectedSeatKeys([])
    },
    [],
  )


  const returnGuestsToPool = useCallback((guestIds: string[]) => {
    const uniqueIds = Array.from(new Set(guestIds))
    if (!uniqueIds.length) {
      return
    }
    setPool((previousPool) => {
      const filtered = previousPool.filter(
        (guestId) => !uniqueIds.includes(guestId),
      )
      const additions = uniqueIds.filter((guestId) => guestMap.has(guestId))
      const merged = [...additions, ...filtered]
      if (
        merged.length === previousPool.length &&
        merged.every((guestId, index) => guestId === previousPool[index])
      ) {
        return previousPool
      }
      return merged
    })
  }, [guestMap])

  const closeMenu = useCallback(() => {
    setMenuState(null)
  }, [])

  const togglePanelCollapsed = useCallback(() => {
    setIsPanelCollapsed((previous) => !previous)
  }, [])

  const releaseSelectedSeats = useCallback(() => {
    if (selectedSeatKeys.length === 0) {
      return
    }

    const returningGuests: string[] = []
    setAssignments((previous) => {
      const next = { ...previous }
      selectedSeatKeys.forEach((seat) => {
        const guestId = next[seat]
        if (guestId) {
          returningGuests.push(guestId)
          next[seat] = null
        }
      })
      return next
    })

    returnGuestsToPool(returningGuests)

    setSelectedSeatKeys([])
  }, [returnGuestsToPool, selectedSeatKeys])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        releaseSelectedSeats()
      }
      if (event.key === 'Escape') {
        setSelectedSeatKeys([])
        closeMenu()
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [closeMenu, releaseSelectedSeats])

  useEffect(() => {
    if (!menuState) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return
      }
      closeMenu()
    }

    const handleViewportChange = () => {
      closeMenu()
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [closeMenu, menuState])

  useEffect(() => {
    if (menuState && !tables.some((table) => table.id === menuState.tableId)) {
      closeMenu()
    }
  }, [closeMenu, menuState, tables])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const snapshot: LayoutSnapshot = {
      version: 1,
      guests,
      tables,
      assignments,
      unassigned: pool,
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch (error) {
      console.error('Unable to persist layout', error)
    }
  }, [assignments, guests, pool, tables])

  useEffect(() => {
    const guestIds = new Set(guests.map((guest) => guest.id))
    const assignedIds = new Set(
      Object.values(assignments).filter(
        (guestId): guestId is string =>
          typeof guestId === 'string' && guestIds.has(guestId),
      ),
    )

    setPool((previousPool) => {
      const next: string[] = []
      const seen = new Set<string>()

      previousPool.forEach((guestId) => {
        if (!assignedIds.has(guestId) && guestIds.has(guestId) && !seen.has(guestId)) {
          next.push(guestId)
          seen.add(guestId)
        }
      })

      guests.forEach((guest) => {
        if (!assignedIds.has(guest.id) && !seen.has(guest.id)) {
          next.push(guest.id)
          seen.add(guest.id)
        }
      })

      if (
        next.length === previousPool.length &&
        next.every((guestId, index) => guestId === previousPool[index])
      ) {
        return previousPool
      }
      return next
    })
  }, [assignments, guests])

  const handleSeatClick = (
    tableId: string,
    seatIndex: number,
    event: React.MouseEvent,
  ) => {
    const key = seatKey(tableId, seatIndex)
    const occupant = assignments[key]
    if (!occupant) {
      setSelectedSeatKeys([])
      return
    }

    setSelectedSeatKeys((previous) => {
      const alreadySelected = previous.includes(key)
      if (event.metaKey || event.ctrlKey) {
        if (alreadySelected) {
          return previous.filter((seat) => seat !== key)
        }
        return [...previous, key]
      }
      if (event.shiftKey) {
        if (alreadySelected) {
          return previous
        }
        return [...previous, key]
      }
      return [key]
    })
  }

  const assignGuestToSeat = (
    guestId: string,
    tableId: string,
    seatIndex: number,
    fromSeatKey?: string,
  ) => {
    const key = seatKey(tableId, seatIndex)
    if (!guestMap.has(guestId)) {
      return
    }

    setAssignments((previousAssignments) => {
      const nextAssignments = { ...previousAssignments }
      const displacedGuest = nextAssignments[key]

      nextAssignments[key] = guestId
      if (fromSeatKey) {
        nextAssignments[fromSeatKey] = null
      }

      if (displacedGuest && displacedGuest !== guestId) {
        returnGuestsToPool([displacedGuest])
      }

      return nextAssignments
    })

    setSelectedSeatKeys([key])
  }

  const handleSeatDrop = (
    tableId: string,
    seatIndex: number,
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const guestId = event.dataTransfer.getData('guestId')
    const fromSeat = event.dataTransfer.getData('fromSeat')

    if (!guestId) {
      return
    }

    assignGuestToSeat(guestId, tableId, seatIndex, fromSeat || undefined)
  }

  const handlePoolDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const fromSeat = event.dataTransfer.getData('fromSeat')
    if (!fromSeat) {
      return
    }

    setAssignments((previous) => {
      const next = { ...previous }
      const guestId = next[fromSeat]
      if (!guestId) {
        return previous
      }

      next[fromSeat] = null
      returnGuestsToPool([guestId])
      return next
    })
    setSelectedSeatKeys([])
  }

  const handleGuestDragStart = (
    guestId: string,
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.dataTransfer.setData('guestId', guestId)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleSeatGuestDragStart = (
    guestId: string,
    seatKeyValue: string,
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.dataTransfer.setData('guestId', guestId)
    event.dataTransfer.setData('fromSeat', seatKeyValue)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleAddTable = () => {
    const seatCount = 8
    const nextTable: Table = {
      id: `table-${Date.now()}`,
      seatCount,
      position: { x: 80 + tables.length * 60, y: 80 + tables.length * 40 },
    }

    setTables((prev) => [...prev, nextTable])
    setAssignments((prev) => {
      const next = { ...prev }
      for (let i = 0; i < seatCount; i += 1) {
        next[seatKey(nextTable.id, i)] = null
      }
      return next
    })
  }

  const openTableMenu = (
    tableId: string,
    event: React.MouseEvent<HTMLElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setMenuState({
      tableId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const getFirstAvailableSeatIndex = (table: Table) => {
    for (let seatIndex = 0; seatIndex < table.seatCount; seatIndex += 1) {
      if (!assignments[seatKey(table.id, seatIndex)]) {
        return seatIndex
      }
    }
    return -1
  }

  const handleTableDrop = (
    tableId: string,
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const guestId = event.dataTransfer.getData('guestId')
    const fromSeat = event.dataTransfer.getData('fromSeat')

    if (!guestId) {
      return
    }

    const table = tables.find((entry) => entry.id === tableId)
    if (!table) {
      return
    }

    const seatIndex = getFirstAvailableSeatIndex(table)
    if (seatIndex === -1) {
      return
    }

    assignGuestToSeat(guestId, tableId, seatIndex, fromSeat || undefined)
  }

  const updateSeatCount = (tableId: string, newSeatCount: number) => {
    const sanitized = Math.max(1, Math.min(24, Math.floor(newSeatCount)))
    const table = tables.find((entry) => entry.id === tableId)
    if (!table || sanitized === table.seatCount) {
      return
    }

    const returningGuests: string[] = []
    setTables((prevTables) =>
      prevTables.map((entry) =>
        entry.id === tableId ? { ...entry, seatCount: sanitized } : entry,
      ),
    )

    setAssignments((prevAssignments) => {
      const nextAssignments = { ...prevAssignments }

      if (sanitized < table.seatCount) {
        for (let seatIdx = sanitized; seatIdx < table.seatCount; seatIdx += 1) {
          const key = seatKey(table.id, seatIdx)
          const guestId = nextAssignments[key]
          if (guestId) {
            returningGuests.push(guestId)
          }
          delete nextAssignments[key]
        }
      } else {
        for (
          let seatIdx = table.seatCount;
          seatIdx < sanitized;
          seatIdx += 1
        ) {
          nextAssignments[seatKey(table.id, seatIdx)] = null
        }
      }

      return nextAssignments
    })

    returnGuestsToPool(returningGuests)
  }

  const handleRemoveTable = (tableId: string) => {
    const returningGuests: string[] = []
    setAssignments((prevAssignments) => {
      const nextAssignments = { ...prevAssignments }
      Object.keys(nextAssignments).forEach((key) => {
        if (key.startsWith(`${tableId}:`)) {
          const guestId = nextAssignments[key]
          if (guestId) {
            returningGuests.push(guestId)
          }
          delete nextAssignments[key]
        }
      })
      return nextAssignments
    })

    returnGuestsToPool(returningGuests)

    setTables((prevTables) =>
      prevTables.filter((table) => table.id !== tableId),
    )
    setSelectedSeatKeys((prevSelected) =>
      prevSelected.filter((key) => !key.startsWith(`${tableId}:`)),
    )
    closeMenu()
  }

  const handleGuestFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result))
        if (!Array.isArray(raw)) {
          throw new Error('Invalid guest file format')
        }

        const seenIds = new Set<string>()
        const cleaned: Guest[] = []
        ;(raw as unknown[]).forEach((item) => {
          if (typeof item !== 'object' || item === null) {
            return
          }
          const record = item as Record<string, unknown>
          const rawName =
            typeof record.name === 'string' ? record.name.trim() : ''
          if (!rawName) {
            return
          }

          const providedId =
            typeof record.id === 'string' ? record.id.trim() : ''
          const fallbackId = rawName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
          const baseId = providedId || fallbackId
          if (!baseId) {
            return
          }

          let candidateId = baseId
          if (seenIds.has(candidateId)) {
            let suffix = 2
            while (seenIds.has(`${baseId}-${suffix}`)) {
              suffix += 1
            }
            candidateId = `${baseId}-${suffix}`
          }
          seenIds.add(candidateId)

          cleaned.push({
            id: candidateId,
            name: rawName,
            details:
              typeof record.details === 'string' ? record.details : undefined,
          })
        })

        if (cleaned.length === 0) {
          throw new Error('No valid guests found in file')
        }

        const guestIds = new Set(cleaned.map((guest) => guest.id))

        const nextAssignments: Record<string, string | null> = {}
        tables.forEach((table) => {
          for (let seatIdx = 0; seatIdx < table.seatCount; seatIdx += 1) {
            const key = seatKey(table.id, seatIdx)
            const candidate = assignments[key]
            nextAssignments[key] = candidate && guestIds.has(candidate) ? candidate : null
          }
        })

        const assignedSet = new Set(
          Object.values(nextAssignments).filter(Boolean) as string[],
        )
        const nextPool = cleaned
          .map((guest) => guest.id)
          .filter((id) => !assignedSet.has(id))

        setGuests(cleaned)
        setAssignments(nextAssignments)
        setPool(nextPool)
        setSelectedSeatKeys([])
      } catch (error) {
        // eslint-disable-next-line no-alert
        alert(
          error instanceof Error
            ? error.message
            : 'Unable to read guest list file',
        )
      }
      input.value = ''
    }
    reader.readAsText(file)
  }

  const handleLayoutExport = () => {
    const snapshot: LayoutSnapshot = {
      version: 1,
      guests,
      tables,
      assignments,
      unassigned: pool,
    }
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'wedding-layout.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleLayoutImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result))
        const normalized = normalizeLayoutPayload(raw)
        if (!normalized) {
          throw new Error('Invalid layout format')
        }
        applyLayoutState(normalized)
      } catch (error) {
        // eslint-disable-next-line no-alert
        alert(
          error instanceof Error
            ? error.message
            : 'Unable to import layout file',
        )
      }
      input.value = ''
    }
    reader.readAsText(file)
  }

  const handleGlobalMouseMove = useCallback(
    (event: MouseEvent) => {
      const dragging = draggingTableRef.current
      if (!dragging) {
        return
      }
      const deltaX = event.clientX - dragging.pointerX
      const deltaY = event.clientY - dragging.pointerY
      setTables((prevTables) =>
        prevTables.map((table) =>
          table.id === dragging.tableId
            ? {
                ...table,
                position: {
                  x: dragging.originX + deltaX,
                  y: dragging.originY + deltaY,
                },
              }
            : table,
        ),
      )
    },
    [setTables],
  )

  const handleGlobalMouseUp = useCallback(() => {
    draggingTableRef.current = null
    window.removeEventListener('mousemove', handleGlobalMouseMove)
    window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [handleGlobalMouseMove])

  useEffect(
    () => () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    },
    [handleGlobalMouseMove, handleGlobalMouseUp],
  )

  const startTableDrag = (
    tableId: string,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    const table = tables.find((entry) => entry.id === tableId)
    if (!table) {
      return
    }
    closeMenu()
    draggingTableRef.current = {
      tableId,
      originX: table.position.x,
      originY: table.position.y,
      pointerX: event.clientX,
      pointerY: event.clientY,
    }
    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
  }

  const handleTableMouseDown = (
    tableId: string,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    const target = event.target as HTMLElement | null
    if (target?.dataset?.drag === 'blocked') {
      return
    }
    startTableDrag(tableId, event)
  }

  const clearSelectionIfMissing = () => {
    setSelectedSeatKeys((prevSelected) =>
      prevSelected.filter((key) => {
        const guestId = assignments[key]
        return Boolean(guestId)
      }),
    )
  }

  useEffect(() => {
    clearSelectionIfMissing()
  }, [assignments])

  const renderSeats = (table: Table) => {
    const seatElements = []
    const radius = 70
    const seatRadius = 22
    for (let seatIndex = 0; seatIndex < table.seatCount; seatIndex += 1) {
      const angle =
        Math.PI * 1.5 + (seatIndex * (Math.PI * 2)) / table.seatCount
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      const key = seatKey(table.id, seatIndex)
      const guestId = assignments[key]
      const guest = guestId ? guestMap.get(guestId) : null
      const isSelected = selectedSeatKeys.includes(key)

      seatElements.push(
        <div
          key={key}
          className={`seat ${guest ? 'filled' : 'empty'} ${
            isSelected ? 'selected' : ''
          }`}
          data-drag="blocked"
          style={{
            width: seatRadius * 2,
            height: seatRadius * 2,
            left: `calc(50% + ${x - seatRadius}px)`,
            top: `calc(50% + ${y - seatRadius}px)`,
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleSeatDrop(table.id, seatIndex, event)}
          onClick={(event) => handleSeatClick(table.id, seatIndex, event)}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div
            className="seat-inner"
            data-drag="blocked"
            draggable={Boolean(guest)}
            onDragStart={(event) => {
              if (guestId) {
                handleSeatGuestDragStart(guestId, key, event)
              }
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {guest ? guest.name : seatIndex + 1}
          </div>
        </div>,
      )
    }
    return seatElements
  }

  const layoutSnapshot: LayoutSnapshot = useMemo(
    () => ({
      version: 1,
      guests,
      tables,
      assignments,
      unassigned: pool,
    }),
    [assignments, guests, pool, tables],
  )

  const activeTable = useMemo(() => {
    if (!menuState) {
      return null
    }
    return tables.find((table) => table.id === menuState.tableId) ?? null
  }, [menuState, tables])

  const menuPosition = useMemo(() => {
    if (!menuState) {
      return null
    }
    const dimensions = { width: 240, height: 240 }
    let x = menuState.x
    let y = menuState.y
    if (typeof window !== 'undefined') {
      const maxX = Math.max(16, window.innerWidth - dimensions.width - 16)
      const maxY = Math.max(16, window.innerHeight - dimensions.height - 16)
      x = Math.min(Math.max(16, x), maxX)
      y = Math.min(Math.max(16, y), maxY)
    }
    return { x, y }
  }, [menuState])

  return (
    <div className={`app-shell ${isPanelCollapsed ? 'panel-collapsed' : ''}`}>
      <aside className={`control-panel ${isPanelCollapsed ? 'collapsed' : ''}`}>
        <button
          type="button"
          className="panel-collapse-toggle"
          onClick={togglePanelCollapsed}
          aria-label={isPanelCollapsed ? 'Expand control panel' : 'Collapse control panel'}
        >
          <span aria-hidden="true">{isPanelCollapsed ? '▶' : '◀'}</span>
        </button>

        <div
          className={`panel-body ${isPanelCollapsed ? 'collapsed' : ''}`}
          aria-hidden={isPanelCollapsed}
        >
          <section className="panel-section guest-section">
            <h2>Guest Pool</h2>
            <div
              className="guest-pool"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handlePoolDrop}
            >
              {pool.length === 0 && (
                <div className="pool-empty">Everyone is seated!</div>
              )}
              {pool.map((guestId) => {
                const guest = guestMap.get(guestId)
                if (!guest) {
                  return null
                }
                return (
                  <div
                    key={guest.id}
                    className="guest-card"
                    draggable
                    onDragStart={(event) =>
                      handleGuestDragStart(guest.id, event)
                    }
                  >
                    <span className="guest-initial">
                      {guest.name
                        .split(' ')
                        .map((chunk) => chunk[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <span className="guest-name">{guest.name}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="panel-section">
            <h2>Guests JSON</h2>
            <label className="file-input">
              <span>Import guest list</span>
              <input
                type="file"
                accept="application/json"
                onChange={handleGuestFileImport}
              />
            </label>
          </section>

          <section className="panel-section">
            <h2>Tables</h2>
            <button
              type="button"
              className="add-table-button"
              onClick={handleAddTable}
            >
              Add table
            </button>
          </section>

          <section className="panel-section">
            <h2>Layout JSON</h2>
            <div className="layout-actions">
              <button type="button" onClick={handleLayoutExport}>
                Export layout
              </button>
              <label className="file-input">
                <span>Import layout</span>
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleLayoutImport}
                />
              </label>
            </div>
            <details>
              <summary>Current snapshot</summary>
              <pre>{JSON.stringify(layoutSnapshot, null, 2)}</pre>
            </details>
          </section>
        </div>
      </aside>

      <main className="canvas-container">
        <div className="canvas">
          {tables.map((table) => (
            <div
              key={table.id}
              className="table"
              style={{
                transform: `translate(${table.position.x}px, ${table.position.y}px)`,
              }}
              onMouseDown={(event) => handleTableMouseDown(table.id, event)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleTableDrop(table.id, event)}
            >
              <div className="table-body">
                <button
                  type="button"
                  className="table-menu-button"
                  data-drag="blocked"
                  onClick={(event) => openTableMenu(table.id, event)}
                  aria-label="Open table settings"
                >
                  ⋮
                </button>
              </div>
              {renderSeats(table)}
            </div>
          ))}
          {!tables.length && (
            <div className="canvas-empty">
              Use “Add table” to place your first table on the canvas.
            </div>
          )}
          {menuState && activeTable && menuPosition && (
            <div
              className="table-context-menu"
              ref={menuRef}
              style={{
                top: `${menuPosition.y}px`,
                left: `${menuPosition.x}px`,
              }}
            >
              <header className="menu-header">
                <span>Table settings</span>
                <button
                  type="button"
                  className="menu-close"
                  onClick={closeMenu}
                  aria-label="Close menu"
                >
                  ×
                </button>
              </header>
              <div className="menu-section">
                <span className="menu-label">Seat count</span>
                <div className="menu-pill-group">
                  {SEAT_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`menu-pill ${
                        activeTable.seatCount === option ? 'active' : ''
                      }`}
                      onClick={() => updateSeatCount(activeTable.id, option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <label className="menu-range">
                  <span>Custom</span>
                  <input
                    type="range"
                    min={1}
                    max={24}
                    value={activeTable.seatCount}
                    onChange={(event) =>
                      updateSeatCount(
                        activeTable.id,
                        Number(event.target.value) || 1,
                      )
                    }
                  />
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={activeTable.seatCount}
                    onChange={(event) =>
                      updateSeatCount(
                        activeTable.id,
                        Number(event.target.value) || 1,
                      )
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="menu-danger"
                onClick={() => handleRemoveTable(activeTable.id)}
              >
                Remove table
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App

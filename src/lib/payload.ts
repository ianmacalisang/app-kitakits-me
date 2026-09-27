import { getPayload } from 'payload'

import configPromise from '@payload-config'

// Shared Payload local-API client — cached per server bundle.
export const getPayloadClient = () => getPayload({ config: configPromise })

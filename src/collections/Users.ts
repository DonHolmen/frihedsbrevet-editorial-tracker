import type { CollectionConfig } from 'payload'

import { isEditor, isEditorFieldLevel, isEditorOrSelf } from '../access'

/**
 * Users / Auth.
 *
 * `auth: true` makes this an auth-enabled collection: Payload auto-provisions
 * the `email` + `password` fields and the full login / logout / refresh /
 * forgot-password endpoint set. Zero auth boilerplate written by us.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role'],
  },
  access: {
    read: isEditorOrSelf, // editors: all users · contributors: own profile only
    create: isEditor, // only editors create new users
    update: isEditorOrSelf, // editors: any user · contributors: themselves
    delete: isEditor,
    admin: () => true, // both roles may reach the admin panel
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'contributor',
      options: [
        { label: 'Editor', value: 'editor' },
        { label: 'Contributor', value: 'contributor' },
      ],
      admin: { position: 'sidebar' },
      // HARDENING: a contributor cannot promote *themselves* to editor.
      // We lock only `update` — collection-level `create: isEditor` already
      // gates who may create users, while leaving `create` open so the very
      // first bootstrap user (and editors creating teammates) can set the role.
      access: {
        update: isEditorFieldLevel,
      },
    },
  ],
}

// src/tests/__mocks__/axios.ts
const mockAxios = {
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} })),
  put: jest.fn(() => Promise.resolve({ data: {} })),
  delete: jest.fn(() => Promise.resolve({ data: {} })),
  patch: jest.fn(() => Promise.resolve({ data: {} })),
  request: jest.fn(() => Promise.resolve({ data: {} })), // Generic request method
  isAxiosError: jest.fn((payload): payload is any => { // Adjust 'any' as needed
    return payload && payload.isAxiosError === true;
  }),
  // Default export for when axios is called as a function e.g. axios(config)
  default: jest.fn(() => Promise.resolve({ data: {} })),
};

// Named export for direct function calls like axios.get(...)
export const { get, post, put, delete: del, patch, request, isAxiosError } = mockAxios;

// Default export for `import axios from 'axios'`
export default mockAxios.default;

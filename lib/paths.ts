export const paths = {
  home: () => '/',
  watch: (id: string | number) => `/watch/${id}`,
  login: () => '/login',
  
  admin: {
    dashboard: () => '/admin',
    movies: () => '/admin/movies',
    movie: (id: string | number) => `/admin/movies/${id}`,
    duplicates: () => '/admin/duplicates',
  },
} as const;

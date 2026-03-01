import React from 'react'

function PageLoading() {
    return (
      <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-4 sm:px-6 py-10">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-6 w-40 bg-emerald-100 rounded" />
              <div className="h-4 w-72 bg-emerald-100 rounded" />
              <div className="h-24 w-full bg-emerald-50 rounded-xl" />
              <div className="h-24 w-full bg-emerald-50 rounded-xl" />
            </div>
          </div>
        </div>
      </main>
    );
  }
export default PageLoading
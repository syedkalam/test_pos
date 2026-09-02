package com.surat.native

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class SyncBackgroundTask(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        return Result.success()
    }
}

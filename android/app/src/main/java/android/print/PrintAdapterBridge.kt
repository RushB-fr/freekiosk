package android.print

import android.os.CancellationSignal
import android.os.ParcelFileDescriptor

/**
 * Makes PrintDocumentAdapter's two result callbacks constructible.
 *
 * Their constructors are package-private, because Android expects PrintManager — and therefore the
 * system print dialog — to drive an adapter. A kiosk has nobody to tap that dialog, so this file
 * lives in the framework's package to subclass them. It holds no logic of its own.
 */
object PrintAdapterBridge {

    fun layout(
        adapter: PrintDocumentAdapter,
        attributes: PrintAttributes,
        cancellationSignal: CancellationSignal,
        onFinished: (info: PrintDocumentInfo?) -> Unit,
        onFailed: (error: CharSequence?) -> Unit,
    ) {
        adapter.onLayout(
            null,
            attributes,
            cancellationSignal,
            object : PrintDocumentAdapter.LayoutResultCallback() {
                override fun onLayoutFinished(info: PrintDocumentInfo?, changed: Boolean) = onFinished(info)

                override fun onLayoutFailed(error: CharSequence?) = onFailed(error)

                override fun onLayoutCancelled() = onFailed("Layout cancelled")
            },
            null,
        )
    }

    fun write(
        adapter: PrintDocumentAdapter,
        destination: ParcelFileDescriptor,
        cancellationSignal: CancellationSignal,
        onFinished: () -> Unit,
        onFailed: (error: CharSequence?) -> Unit,
    ) {
        adapter.onWrite(
            arrayOf(PageRange.ALL_PAGES),
            destination,
            cancellationSignal,
            object : PrintDocumentAdapter.WriteResultCallback() {
                override fun onWriteFinished(pages: Array<out PageRange>?) = onFinished()

                override fun onWriteFailed(error: CharSequence?) = onFailed(error)

                override fun onWriteCancelled() = onFailed("Write cancelled")
            },
        )
    }
}

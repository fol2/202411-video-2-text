import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { forwardRef, useImperativeHandle } from 'react'

interface RichTextEditorProps {
  initialContent: string;
  onChange: (content: string) => void;
}

const RichTextEditor = forwardRef<any, RichTextEditorProps>(({ initialContent, onChange }, ref) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  useImperativeHandle(ref, () => ({
    getHTML: () => editor?.getHTML(),
    chain: () => editor?.chain(),
  }))

  return (
    <EditorContent 
      editor={editor} 
      className="prose prose-sm max-w-none focus:outline-none"
    />
  )
})

RichTextEditor.displayName = 'RichTextEditor'

export default RichTextEditor 
# Wisdom 
 
## Iteration 1 
 
### 1. What are you least confident about right now? What would you do differently? 
 
Live Preview tag clicks and source-line jumps are my least certain areas. I would check both in a disposable vault, including when the source opens in a different view mode. 
 
### 2. What is the biggest thing I am missing about the situation right now? What would you do differently? 
 
The result cap limits what the modal displays. Every Markdown file is still read so the skipped-file count stays accurate. I would measure click-to-results time in a representative large disposable vault before deciding whether caching is needed. 
 
### 3. What assumption did you make that, if wrong, would change your answer the most? What would you do differently? 
 
I assumed blank lines and ATX headings are enough for the first reading experience. If important notes use Setext headings or fenced examples inside lists and quotes, I would add fixtures from representative synthetic notes and expand the extractor before building section mode. 
 
## Iteration 2 
 
### 1. What are you least confident about right now? What would you do differently? 
 
I am least confident that Obsidian will visibly scroll to the first tagged line in each view mode. I would verify that in the disposable vault with the heading and tagged line far apart. 
 
### 2. What is the biggest thing I am missing about the situation right now? What do I not realize? What would you do differently? 
 
The result cap counts matches. A few long sections can still render a lot of text. I would try several long synthetic notes in the disposable vault and measure how quickly the modal opens and scrolls. 
 
### 3. What assumption did you make that, if wrong, would change your answer the most? What would you do differently? 
 
I treated a nested-only hit as a result for the nearest heading. A parent appears when it has its own hit and still includes its children. I would test notes with both parent and child hits in iteration 3 to check whether showing both contexts is useful. 
 
## Iteration 3 
 
### 1. What are you least confident about right now? What would you do differently? 
 
I am least confident about source positioning in Obsidian. I would verify a nonzero tagged-line jump in Reading view and Live Preview. 
 
### 2. What is the biggest thing I am missing about the situation right now? What would you do differently? 
 
The source-link eval starts with an introductory result at line zero. It can prove navigation to a different note, but a default cursor position can look like a correct line jump. I would also click the Grafting result and check line 11. 
 
### 3. What assumption did you make that, if wrong, would change your answer the most? What would you do differently? 
 
I assumed Obsidian 1.15.1 still renders Live Preview tags as adjacent hashtag spans. If its markup differs, I would inspect the actual spans in the disposable vault and use that structure to drive a focused regression test. 
